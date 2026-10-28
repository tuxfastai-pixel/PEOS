import type {Pool,PoolClient} from "pg";
import {z} from "zod";
import {AdminError,transaction} from "../school-admin/service";
export const directoryQuery=z.object({q:z.string().trim().max(100).default(""),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).strict();
export async function assertFounder(db:Pick<Pool,"query">,personId:string){
 const r=await db.query(`SELECT ra.id FROM access.role_assignments ra JOIN access.roles r ON r.id=ra.role_id JOIN identity.persons p ON p.id=ra.person_id
 WHERE p.id=$1 AND p.status='ACTIVE' AND r.code='SPACECASE_FOUNDER' AND ra.organisation_id IS NULL AND ra.status='ACTIVE'
 AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now()) FOR SHARE OF ra,p`,[personId]);
 if(!r.rows.length)throw new AdminError("FOUNDER_REQUIRED");
}
async function audit(db:PoolClient,actor:string,action:string,resourceId?:string){
 await db.query(`INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason)
 VALUES($1,$2,'SPACECASE_OPERATIONS',$3,'ALLOW','current_global_founder_role')`,[actor,action,resourceId??null]);
}
export async function supportContext(pool:Pool,actor:string){
 return transaction(pool,async db=>{
 const active=await db.query("SELECT id FROM identity.persons WHERE id=$1 AND status='ACTIVE' FOR SHARE",[actor]);
 if(!active.rows.length)throw new AdminError("ACTIVE_PERSON_REQUIRED");
 const founder=await db.query(`SELECT ra.id FROM access.role_assignments ra JOIN access.roles r ON r.id=ra.role_id
 WHERE ra.person_id=$1 AND r.code='SPACECASE_FOUNDER' AND ra.organisation_id IS NULL AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now()) FOR SHARE OF ra`,[actor]);
 const schools=await db.query(`SELECT DISTINCT o.id,o.display_name AS "displayName" FROM organisation.organisations o
 JOIN organisation.memberships m ON m.organisation_id=o.id JOIN access.role_assignments ra ON ra.person_id=m.person_id AND ra.organisation_id=o.id JOIN access.roles r ON r.id=ra.role_id
 WHERE m.person_id=$1 AND o.organisation_type='SCHOOL' AND o.status='ACTIVE' AND m.membership_type='STAFF' AND m.status='ACTIVE'
 AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now()) AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now())
 AND r.code IN ('TEACHER','PRINCIPAL','SCHOOL_ADMINISTRATOR','SCHOOL_FINANCE_OFFICER') ORDER BY "displayName",o.id`,[actor]);
 await db.query(`INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason,metadata) VALUES($1::uuid,'support.context.read','SPACECASE_AUTHORITY',$1::uuid::text,'ALLOW','current_person_and_role_checks',$2::jsonb)`,[actor,JSON.stringify({founder:founder.rows.length>0,schoolCount:schools.rows.length})]);
 const observers=await db.query(`SELECT o.id,o.display_name AS "displayName",bool_or(r.code='SPACECASE_SUPPORT_AGENT') AS "canHandle" FROM organisation.organisations o
 JOIN organisation.memberships m ON m.organisation_id=o.id JOIN access.role_assignments ra ON ra.person_id=m.person_id AND ra.organisation_id=o.id JOIN access.roles r ON r.id=ra.role_id
 WHERE m.person_id=$1 AND m.membership_type='SUPPORT_OPERATOR' AND m.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
 AND o.organisation_type='SCHOOL' AND o.status='ACTIVE' AND r.code IN ('SPACECASE_SUPPORT_OBSERVER','SPACECASE_SUPPORT_AGENT') AND ra.status='ACTIVE' AND ra.starts_at<=now() AND ra.ends_at>now()
 AND NOT EXISTS(SELECT 1 FROM organisation.memberships learner WHERE learner.person_id=$1 AND learner.membership_type='LEARNER' AND learner.status='ACTIVE' AND learner.starts_at<=now() AND (learner.ends_at IS NULL OR learner.ends_at>now())) GROUP BY o.id,o.display_name ORDER BY "displayName",o.id LIMIT 201`,[actor]);
 if(observers.rows.length>200)throw new AdminError("OBSERVER_SCOPE_LIMIT",403);
 return {personId:actor,founder:founder.rows.length>0,schools:schools.rows,observerSchools:observers.rows.map(({id,displayName})=>({id,displayName})),agentSchools:observers.rows.filter(r=>r.canHandle).map(({id,displayName})=>({id,displayName}))};
 });
}
const summary=`SELECT o.id,o.display_name AS "displayName",o.status,o.created_at AS "createdAt",
 (SELECT count(*)::int FROM organisation.classes c WHERE c.school_id=o.id AND c.status='ACTIVE') AS "classCount",
 (SELECT count(DISTINCT m.person_id)::int FROM organisation.memberships m JOIN identity.persons p ON p.id=m.person_id WHERE m.organisation_id=o.id AND m.membership_type='STAFF' AND m.status='ACTIVE' AND p.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())) AS "staffCount",
 (SELECT count(DISTINCT m.person_id)::int FROM organisation.memberships m JOIN identity.persons p ON p.id=m.person_id WHERE m.organisation_id=o.id AND m.membership_type='LEARNER' AND m.status='ACTIVE' AND p.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())) AS "learnerCount",
 (SELECT count(*)::int FROM organisation.staff_invitations i WHERE i.school_id=o.id AND i.accepted_at IS NULL AND i.revoked_at IS NULL AND i.expires_at>now()) AS "pendingInvitations"
 FROM organisation.organisations o`;
export async function founderDirectory(pool:Pool,actor:string,q:string,offset:number){
 return transaction(pool,async db=>{
 await assertFounder(db,actor);
 const result=await db.query(summary+` WHERE o.organisation_type='SCHOOL' AND strpos(lower(o.display_name),lower($1))>0 ORDER BY lower(o.display_name),o.id LIMIT 51 OFFSET $2`,[q,offset]);
 await audit(db,actor,"founder.schools.list");
 return {schools:result.rows.slice(0,50),nextOffset:result.rows.length>50?offset+50:null,asOf:new Date().toISOString()};
 });
}
export async function founderSchool(pool:Pool,actor:string,schoolId:string){
 return transaction(pool,async db=>{
 await assertFounder(db,actor);
 const result=await db.query(summary+" WHERE o.organisation_type='SCHOOL' AND o.id=$1",[schoolId]);
 if(!result.rows[0])throw new AdminError("SCHOOL_UNAVAILABLE",404);
 const classes=await db.query(`SELECT c.id,c.name,c.academic_year AS "academicYear",
 (SELECT count(DISTINCT ta.teacher_person_id)::int FROM organisation.teacher_assignments ta JOIN identity.persons p ON p.id=ta.teacher_person_id WHERE ta.class_id=c.id AND ta.school_id=c.school_id AND ta.status='ACTIVE' AND p.status='ACTIVE' AND ta.starts_at<=now() AND (ta.ends_at IS NULL OR ta.ends_at>now())
 AND EXISTS(SELECT 1 FROM organisation.memberships m WHERE m.person_id=p.id AND m.organisation_id=c.school_id AND m.membership_type='STAFF' AND m.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now()))
 AND EXISTS(SELECT 1 FROM access.role_assignments ra JOIN access.roles r ON r.id=ra.role_id WHERE ra.person_id=p.id AND ra.organisation_id=c.school_id AND r.code='TEACHER' AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now()))) AS "assignedTeachers"
 FROM organisation.classes c WHERE c.school_id=$1 AND c.status='ACTIVE' ORDER BY lower(c.name),c.id LIMIT 200`,[schoolId]);
 await audit(db,actor,"founder.school.read",schoolId);
 return {school:result.rows[0],classes:classes.rows,classesTruncated:result.rows[0].classCount>classes.rows.length,asOf:new Date().toISOString()};
 });
}
