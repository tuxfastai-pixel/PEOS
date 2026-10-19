import type {Pool,PoolClient} from "pg";
import {z} from "zod";
import {AdminError,assertSchoolAdmin,audit,transaction} from "./service";

const name=z.string().trim().min(1).max(80).regex(/^[^\u0000-\u001f\u007f]+$/).transform(v=>v.replace(/\s+/g," "));
export const learnerInputSchema=z.object({
  admissionNumber:z.string().trim().min(1).max(40).regex(/^[A-Za-z0-9][A-Za-z0-9._/-]*$/).transform(v=>v.toUpperCase()),
  givenName:name,familyName:name,
}).strict();
export const learnerBatchSchema=z.object({learners:z.array(learnerInputSchema).min(1).max(50)}).strict().superRefine((value,ctx)=>{
  const seen=new Set<string>();for(const [index,row] of value.learners.entries()){
    if(seen.has(row.admissionNumber))ctx.addIssue({code:z.ZodIssueCode.custom,path:["learners",index,"admissionNumber"],message:"Duplicate school learner reference"});
    seen.add(row.admissionNumber);
  }
});
export const rosterQuerySchema=z.object({offset:z.coerce.number().int().min(0).max(1_000_000).default(0)}).strict();
async function classroom(db:PoolClient,schoolId:string,classId:string){
  const result=await db.query(`SELECT id,name,academic_year AS "academicYear" FROM organisation.classes
    WHERE id=$1 AND school_id=$2 AND status='ACTIVE' FOR SHARE`,[classId,schoolId]);
  if(!result.rows[0])throw new AdminError("CLASS_UNAVAILABLE",404);
  return result.rows[0] as {id:string;name:string;academicYear:number|null};
}
export async function assertClassTeacher(db:Pick<Pool,"query">,actor:string,schoolId:string,classId:string){
  const result=await db.query(`SELECT ta.id FROM organisation.teacher_assignments ta
    JOIN organisation.classes c ON c.id=ta.class_id AND c.school_id=ta.school_id
    JOIN organisation.organisations o ON o.id=c.school_id
    JOIN identity.persons p ON p.id=ta.teacher_person_id
    JOIN organisation.memberships m ON m.person_id=p.id AND m.organisation_id=o.id
    JOIN access.role_assignments ra ON ra.person_id=p.id AND ra.organisation_id=o.id
    JOIN access.roles r ON r.id=ra.role_id
    WHERE p.id=$1 AND ta.school_id=$2 AND c.id=$3 AND p.status='ACTIVE' AND o.status='ACTIVE' AND o.organisation_type='SCHOOL'
      AND c.status='ACTIVE' AND ta.status='ACTIVE' AND ta.starts_at<=now() AND (ta.ends_at IS NULL OR ta.ends_at>now())
      AND m.membership_type='STAFF' AND m.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
      AND r.code='TEACHER' AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now())
    FOR SHARE OF ta,c,o,p,m,ra`,[actor,schoolId,classId]);
  if(!result.rows.length)throw new AdminError("CLASS_TEACHER_REQUIRED");
}
export async function classRoster(pool:Pool,actor:string,schoolId:string,classId:string,offset=0,reader:"admin"|"teacher"="admin"){
  return transaction(pool,async db=>{
    if(reader==="admin")await assertSchoolAdmin(db,actor,schoolId);else await assertClassTeacher(db,actor,schoolId,classId);
    const classInfo=await classroom(db,schoolId,classId);
    const rows=await db.query(`SELECT p.id AS "personId",r.admission_number AS "admissionNumber",n.given_name AS "givenName",n.family_name AS "familyName"
      FROM organisation.class_memberships cm JOIN identity.persons p ON p.id=cm.learner_person_id
      JOIN organisation.learner_registrations r ON r.learner_person_id=p.id AND r.school_id=$2
      JOIN identity.person_names n ON n.person_id=p.id
      JOIN organisation.memberships m ON m.person_id=p.id AND m.organisation_id=r.school_id AND m.membership_type='LEARNER'
      WHERE cm.class_id=$1 AND cm.status='ACTIVE' AND p.status='ACTIVE' AND r.status='ACTIVE'
        AND m.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
      ORDER BY lower(n.family_name),lower(n.given_name),p.id LIMIT 101 OFFSET $3`,[classId,schoolId,offset]);
    await audit(db,actor,"school.class.roster",schoolId,classId);
    return {class:classInfo,learners:rows.rows.slice(0,100),nextOffset:rows.rows.length>100?offset+100:null};
  });
}
export async function enrolLearners(pool:Pool,actor:string,schoolId:string,classId:string,input:z.infer<typeof learnerBatchSchema>){
  return transaction(pool,async db=>{
    await assertSchoolAdmin(db,actor,schoolId);await classroom(db,schoolId,classId);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["learner-registry",schoolId.toLowerCase()])]);
    const results:Array<{admissionNumber:string;status:"CREATED"|"ENROLLED"|"ALREADY_ENROLLED"|"CONFLICT";personId?:string}>=[];
    for(const row of input.learners){
      const existing=await db.query(`SELECT r.learner_person_id AS id,r.status,n.given_name,n.family_name,p.status AS person_status
        FROM organisation.learner_registrations r JOIN identity.persons p ON p.id=r.learner_person_id
        JOIN identity.person_names n ON n.person_id=p.id WHERE r.school_id=$1 AND r.admission_number=$2 FOR SHARE OF r,p,n`,[schoolId,row.admissionNumber]);
      let personId:string|undefined=existing.rows[0]?.id;let created=false;
      const member=personId?await db.query(`SELECT id FROM organisation.memberships WHERE person_id=$1 AND organisation_id=$2 AND membership_type='LEARNER'
        AND status='ACTIVE' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now()) FOR SHARE`,[personId,schoolId]):null;
      const old=existing.rows[0];
      if(old&&(old.status!=="ACTIVE"||old.person_status!=="ACTIVE"||!member?.rows.length||old.given_name.toLowerCase()!==row.givenName.toLowerCase()||old.family_name.toLowerCase()!==row.familyName.toLowerCase())){
        results.push({admissionNumber:row.admissionNumber,status:"CONFLICT"});
        await db.query(`INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason,metadata)
          VALUES ($1,'school.learner.enrol','SCHOOL',$2,'DENY','learner_reference_conflict',jsonb_build_object('classId',$3::text))`,[actor,schoolId,classId]);
        continue;
      }
      if(!personId){
        personId=(await db.query("INSERT INTO identity.persons DEFAULT VALUES RETURNING id")).rows[0].id;created=true;
        await db.query("INSERT INTO identity.person_names(person_id,given_name,family_name) VALUES ($1,$2,$3)",[personId,row.givenName,row.familyName]);
        await db.query("INSERT INTO organisation.learner_registrations(school_id,learner_person_id,admission_number,created_by) VALUES ($1,$2,$3,$4)",[schoolId,personId,row.admissionNumber,actor]);
        await db.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES ($1,$2,'LEARNER')",[personId,schoolId]);
      }
      const enrolled=await db.query(`INSERT INTO organisation.class_memberships(class_id,learner_person_id) VALUES ($1,$2)
        ON CONFLICT(class_id,learner_person_id) DO UPDATE SET status='ACTIVE' WHERE organisation.class_memberships.status<>'ACTIVE' RETURNING id`,[classId,personId]);
      const status=created?"CREATED":enrolled.rowCount?"ENROLLED":"ALREADY_ENROLLED";
      results.push({admissionNumber:row.admissionNumber,status,personId});
      await audit(db,actor,"school.learner.enrol",schoolId,personId!);
    }
    return {results};
  });
}
export async function removeClassLearner(pool:Pool,actor:string,schoolId:string,classId:string,personId:string){
  return transaction(pool,async db=>{
    await assertSchoolAdmin(db,actor,schoolId);await classroom(db,schoolId,classId);
    await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["learner-registry",schoolId.toLowerCase()])]);
    const result=await db.query(`UPDATE organisation.class_memberships cm SET status='ENDED' FROM organisation.learner_registrations r
      WHERE cm.class_id=$1 AND cm.learner_person_id=$2 AND r.learner_person_id=cm.learner_person_id AND r.school_id=$3 AND cm.status='ACTIVE' RETURNING cm.id`,[classId,personId,schoolId]);
    if(!result.rows.length)throw new AdminError("ENROLMENT_UNAVAILABLE",404);
    await audit(db,actor,"school.learner.remove_class",schoolId,personId);return {removed:true};
  });
}
