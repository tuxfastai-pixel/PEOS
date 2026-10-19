import type { Pool } from "pg";
import { z } from "zod";
import { AdminError, assertSchoolAdmin, audit, transaction } from "./service";

export const classInputSchema = z.object({
  name: z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/).transform(v => v.replace(/\s+/g, " ")),
  academicYear: z.number().int().min(1900).max(2200),
}).strict();
export const teacherAssignmentSchema = z.object({ teacherPersonId: z.string().uuid().transform(v=>v.toLowerCase()) }).strict();

export async function classDirectory(pool: Pool, actor: string, schoolId: string) {
  return transaction(pool, async db => {
    await assertSchoolAdmin(db, actor, schoolId);
    const classes = await db.query(`SELECT id,name,academic_year AS "academicYear" FROM organisation.classes
      WHERE school_id=$1 AND status='ACTIVE' ORDER BY academic_year DESC NULLS LAST,name,id LIMIT 200`, [schoolId]);
    const teachers = await db.query(`SELECT DISTINCT p.id AS "personId",
      (SELECT i.email FROM organisation.staff_invitations i WHERE i.school_id=$1 AND i.accepted_by=p.id
        AND i.accepted_at IS NOT NULL ORDER BY i.accepted_at DESC LIMIT 1) AS email
      FROM identity.persons p JOIN organisation.memberships m ON m.person_id=p.id
      JOIN access.role_assignments ra ON ra.person_id=p.id AND ra.organisation_id=m.organisation_id
      JOIN access.roles r ON r.id=ra.role_id
      WHERE m.organisation_id=$1 AND p.status='ACTIVE' AND m.membership_type='STAFF' AND m.status='ACTIVE'
        AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now()) AND r.code='TEACHER'
        AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now())
      ORDER BY email NULLS LAST,"personId" LIMIT 200`, [schoolId]);
    const assignments = await db.query(`SELECT DISTINCT ta.class_id AS "classId",ta.teacher_person_id AS "teacherPersonId"
      FROM organisation.teacher_assignments ta JOIN organisation.classes c ON c.id=ta.class_id
      WHERE ta.school_id=$1 AND c.school_id=$1 AND c.status='ACTIVE' AND ta.status='ACTIVE'
        AND ta.starts_at<=now() AND (ta.ends_at IS NULL OR ta.ends_at>now())
        AND ta.teacher_person_id=ANY($2::uuid[]) AND ta.class_id=ANY($3::uuid[])
      ORDER BY "classId","teacherPersonId"`, [schoolId, teachers.rows.map(t => t.personId), classes.rows.map(c => c.id)]);
    await audit(db, actor, "school.class.list", schoolId, schoolId);
    return { classes: classes.rows, teachers: teachers.rows, assignments: assignments.rows };
  });
}

export async function createSchoolClass(pool: Pool, actor: string, schoolId: string, input: z.infer<typeof classInputSchema>) {
  return transaction(pool, async db => {
    await assertSchoolAdmin(db, actor, schoolId);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify(["class",schoolId.toLowerCase(),input.academicYear])]);
    const duplicate = await db.query(`SELECT id FROM organisation.classes WHERE school_id=$1
      AND academic_year=$2 AND lower(regexp_replace(trim(name),'[[:space:]]+',' ','g'))=lower($3) AND status='ACTIVE'`, [schoolId,input.academicYear,input.name]);
    if (duplicate.rows.length) throw new AdminError("CLASS_ALREADY_EXISTS",409);
    const result = await db.query(`INSERT INTO organisation.classes(school_id,name,academic_year) VALUES ($1,$2,$3)
      RETURNING id,name,academic_year AS "academicYear"`, [schoolId,input.name,input.academicYear]);
    await audit(db,actor,"school.class.create",schoolId,result.rows[0].id);
    return result.rows[0];
  });
}

export async function assignClassTeacher(pool: Pool, actor: string, schoolId: string, classId: string, teacherPersonId: string) {
  return transaction(pool, async db => {
    await assertSchoolAdmin(db,actor,schoolId);
    const classroom = await db.query(`SELECT id FROM organisation.classes WHERE id=$1 AND school_id=$2 AND status='ACTIVE' FOR SHARE`,[classId,schoolId]);
    if (!classroom.rows.length) throw new AdminError("CLASS_UNAVAILABLE",404);
    const teacher = await db.query(`SELECT p.id FROM identity.persons p JOIN organisation.memberships m ON m.person_id=p.id
      JOIN access.role_assignments ra ON ra.person_id=p.id AND ra.organisation_id=m.organisation_id JOIN access.roles r ON r.id=ra.role_id
      WHERE p.id=$1 AND m.organisation_id=$2 AND p.status='ACTIVE' AND m.membership_type='STAFF' AND m.status='ACTIVE'
        AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now()) AND r.code='TEACHER'
        AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now()) FOR SHARE OF p,m,ra`,[teacherPersonId,schoolId]);
    if (!teacher.rows.length) throw new AdminError("ACTIVE_SCHOOL_TEACHER_REQUIRED");
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["assignment",schoolId,classId,teacherPersonId]).toLowerCase()]);
    // The lock may have waited for a transaction that started later than this one.
    // PostgreSQL now() is fixed at transaction start; use the current clock here.
    const existing=await db.query(`SELECT id FROM organisation.teacher_assignments WHERE school_id=$1 AND class_id=$2
      AND teacher_person_id=$3 AND status='ACTIVE' AND starts_at<=clock_timestamp() AND (ends_at IS NULL OR ends_at>clock_timestamp())`,[schoolId,classId,teacherPersonId]);
    if (!existing.rows.length) await db.query(`INSERT INTO organisation.teacher_assignments(school_id,class_id,teacher_person_id)
      VALUES ($1,$2,$3)`,[schoolId,classId,teacherPersonId]);
    await audit(db,actor,"school.class.assign_teacher",schoolId,classId);
    return { assigned:true };
  });
}

export async function removeClassTeacher(pool: Pool,actor:string,schoolId:string,classId:string,teacherPersonId:string) {
  return transaction(pool,async db=>{
    await assertSchoolAdmin(db,actor,schoolId);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["assignment",schoolId,classId,teacherPersonId]).toLowerCase()]);
    const result=await db.query(`UPDATE organisation.teacher_assignments ta SET status='ENDED',ends_at=now()
      FROM organisation.classes c WHERE ta.class_id=c.id AND c.school_id=$1 AND ta.school_id=$1
      AND ta.class_id=$2 AND ta.teacher_person_id=$3 AND ta.status='ACTIVE' RETURNING ta.id`,[schoolId,classId,teacherPersonId]);
    if (!result.rows.length) throw new AdminError("ASSIGNMENT_UNAVAILABLE",404);
    await audit(db,actor,"school.class.remove_teacher",schoolId,classId);
    return { removed:true };
  });
}
