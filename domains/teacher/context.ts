import type { Pool } from "pg";

export type TeacherContext = {
  personId: string;
  schoolId: string;
  roleIds: string[];
  classIds: string[];
  classes: Array<{ id:string; name:string; academicYear:number|null }>;
  active: boolean;
};

export async function getTeacherContext(pool: Pool, personId: string): Promise<TeacherContext | null> {
  const membership = await pool.query<{ school_id: string }>(
    `
      SELECT m.organisation_id AS school_id
      FROM organisation.memberships m
      JOIN identity.persons p ON p.id=m.person_id AND p.status='ACTIVE'
      JOIN organisation.organisations o ON o.id = m.organisation_id
      WHERE m.person_id = $1
        AND m.membership_type = 'STAFF'
        AND m.status = 'ACTIVE'
        AND m.starts_at <= now()
        AND (m.ends_at IS NULL OR m.ends_at > now())
        AND o.organisation_type = 'SCHOOL'
        AND o.status = 'ACTIVE'
      ORDER BY m.starts_at DESC
      LIMIT 1
    `,
    [personId],
  );

  const schoolId = membership.rows[0]?.school_id;
  if (!schoolId) return null;

  const roles = await pool.query<{ role_id: string }>(
    `
      SELECT ra.role_id
      FROM access.role_assignments ra
      JOIN access.roles r ON r.id=ra.role_id AND r.code='TEACHER'
      WHERE ra.person_id = $1
        AND ra.organisation_id = $2
        AND ra.status = 'ACTIVE'
        AND ra.starts_at <= now()
        AND (ra.ends_at IS NULL OR ra.ends_at > now())
    `,
    [personId, schoolId],
  );

  if (roles.rows.length === 0) return null;

  const classes = await pool.query<{ class_id: string; name:string; academic_year:number|null }>(
    `
      SELECT DISTINCT ta.class_id,c.name,c.academic_year
      FROM organisation.teacher_assignments ta
      JOIN organisation.classes c ON c.id = ta.class_id
      WHERE ta.teacher_person_id = $1
        AND ta.school_id = $2
        AND ta.status = 'ACTIVE'
        AND ta.starts_at <= now()
        AND (ta.ends_at IS NULL OR ta.ends_at > now())
        AND c.status = 'ACTIVE'
        AND c.school_id = $2
      ORDER BY c.academic_year DESC NULLS LAST,c.name,ta.class_id
    `,
    [personId, schoolId],
  );

  return {
    personId,
    schoolId,
    roleIds: roles.rows.map((row) => row.role_id),
    classIds: classes.rows.map((row) => row.class_id),
    classes: classes.rows.map(row=>({id:row.class_id,name:row.name,academicYear:row.academic_year})),
    active: true,
  };
}
