import type {Pool} from "pg";
import {z} from "zod";
import {assertFounder} from "./service";
import {AdminError,transaction} from "../school-admin/service";
export const observerInput=z.discriminatedUnion("action",[
 z.object({action:z.literal("GRANT"),personId:z.string().uuid(),days:z.number().int().min(1).max(30),reason:z.string().trim().min(10).max(500)}).strict(),
 z.object({action:z.literal("REVOKE"),assignmentId:z.string().uuid(),reason:z.string().trim().min(10).max(500)}).strict(),
]);
export async function manageObservers(pool:Pool,actor:string,schoolId:string,input?:z.infer<typeof observerInput>){
 return transaction(pool,async db=>{
 await assertFounder(db,actor);
 const school=await db.query("SELECT id FROM organisation.organisations WHERE id=$1 AND organisation_type='SCHOOL' AND status='ACTIVE' FOR SHARE",[schoolId]);
 if(!school.rowCount)throw new AdminError("SCHOOL_UNAVAILABLE",404);
 if(input?.action==="GRANT"){
 await db.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",["observer:"+schoolId+":"+input.personId]);
 const eligible=await db.query(`SELECT p.id FROM identity.persons p WHERE p.id=$1 AND p.status='ACTIVE'
 AND EXISTS(SELECT 1 FROM identity.accounts a WHERE a.person_id=p.id AND a.status='ACTIVE')
 AND NOT EXISTS(SELECT 1 FROM organisation.memberships m WHERE m.person_id=p.id AND m.membership_type='LEARNER' AND m.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())) FOR SHARE OF p`,[input.personId]);
 if(!eligible.rowCount)throw new AdminError("OPERATOR_ACCOUNT_REQUIRED",400);
 await db.query("INSERT INTO access.roles(code,name) VALUES('SPACECASE_SUPPORT_OBSERVER','SpaceCase support observer') ON CONFLICT(code) DO NOTHING");
 await db.query(`INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'SUPPORT_OPERATOR') ON CONFLICT(person_id,organisation_id,membership_type) DO UPDATE SET status='ACTIVE',starts_at=now(),ends_at=NULL`,[input.personId,schoolId]);
 await db.query(`UPDATE access.role_assignments SET status='ENDED',ends_at=now() WHERE person_id=$1 AND organisation_id=$2 AND role_id=(SELECT id FROM access.roles WHERE code='SPACECASE_SUPPORT_OBSERVER') AND status='ACTIVE'`,[input.personId,schoolId]);
 await db.query(`INSERT INTO access.role_assignments(person_id,organisation_id,role_id,ends_at) SELECT $1,$2,id,now()+$3*interval '1 day' FROM access.roles WHERE code='SPACECASE_SUPPORT_OBSERVER'`,[input.personId,schoolId,input.days]);
 }else if(input?.action==="REVOKE"){
 const result=await db.query(`UPDATE access.role_assignments ra SET status='ENDED',ends_at=now() FROM access.roles r WHERE ra.id=$1 AND ra.organisation_id=$2 AND ra.role_id=r.id AND r.code='SPACECASE_SUPPORT_OBSERVER' RETURNING ra.id`,[input.assignmentId,schoolId]);
 if(!result.rowCount)throw new AdminError("OBSERVER_ASSIGNMENT_UNAVAILABLE",404);
 }
 await db.query(`INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason,metadata) VALUES($1,$2,'SPACECASE_OBSERVER',$3,'ALLOW',$4,$5::jsonb)`,[actor,input?"founder.observer."+input.action.toLowerCase():"founder.observer.list",schoolId,input?.reason??"current_global_founder_role",JSON.stringify(input?.action==="GRANT"?{personId:input.personId,days:input.days}:input?.action==="REVOKE"?{assignmentId:input.assignmentId}:{})]);
 const rows=await db.query(`SELECT ra.id,ra.person_id AS "personId",ra.ends_at AS "endsAt" FROM access.role_assignments ra JOIN access.roles r ON r.id=ra.role_id WHERE ra.organisation_id=$1 AND r.code='SPACECASE_SUPPORT_OBSERVER' AND ra.status='ACTIVE' AND ra.starts_at<=now() AND ra.ends_at>now() ORDER BY ra.ends_at,ra.id LIMIT 201`,[schoolId]);
 return {observers:rows.rows.slice(0,200),truncated:rows.rows.length>200};
 });
}
