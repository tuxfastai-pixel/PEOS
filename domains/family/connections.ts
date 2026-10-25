import type {Pool} from 'pg';
import {z} from 'zod';
import {AdminError,transaction} from '../school-admin/service';
export const familyHistoryQuery=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0)}).strict();
export const withdrawConnectionInput=z.object({acknowledgement:z.literal(true)}).strict();
async function activeOwner(db:Pick<Pool,'query'>,person:string){
 if(!(await db.query("SELECT id FROM identity.persons WHERE id=$1 AND status='ACTIVE' FOR SHARE",[person])).rows.length)throw new AdminError('ACTIVE_PERSON_REQUIRED');
}
const activeLearner=`EXISTS(SELECT 1 FROM organisation.learner_registrations r
 JOIN identity.persons p ON p.id=r.learner_person_id
 JOIN organisation.memberships m ON m.person_id=p.id AND m.organisation_id=r.school_id AND m.membership_type='LEARNER'
 WHERE r.school_id=i.school_id AND r.learner_person_id=i.learner_person_id AND r.status='ACTIVE' AND p.status='ACTIVE'
 AND m.status='ACTIVE' AND m.starts_at<=clock_timestamp() AND (m.ends_at IS NULL OR m.ends_at>clock_timestamp()))`;
const activeIssuer=`EXISTS(SELECT 1 FROM organisation.memberships m
 JOIN access.role_assignments ra ON ra.person_id=m.person_id AND ra.organisation_id=m.organisation_id
 JOIN access.roles r ON r.id=ra.role_id JOIN identity.persons p ON p.id=m.person_id
 WHERE m.person_id=i.created_by AND m.organisation_id=i.school_id AND m.membership_type='STAFF' AND m.status='ACTIVE'
 AND p.status='ACTIVE' AND m.starts_at<=clock_timestamp() AND (m.ends_at IS NULL OR m.ends_at>clock_timestamp())
 AND ra.status='ACTIVE' AND ra.starts_at<=clock_timestamp() AND (ra.ends_at IS NULL OR ra.ends_at>clock_timestamp())
 AND r.code IN ('SCHOOL_ADMINISTRATOR','PRINCIPAL'))`;
/** Own claimed-request history only. This projection never authorizes access to learner records. */
export async function listFamilyConnections(pool:Pool,person:string,offset=0){return transaction(pool,async db=>{
 await activeOwner(db,person);
 const result=await db.query(`SELECT i.id,o.display_name AS "schoolName",i.relationship,
 CASE WHEN i.status='REVOKED' THEN 'REVOKED'
 WHEN i.status='DECLINED' THEN 'DECLINED'
 WHEN i.status='EXPIRED' OR(i.status='CLAIMED' AND i.expires_at<=clock_timestamp()) THEN 'EXPIRED'
 WHEN o.status<>'ACTIVE' OR o.organisation_type<>'SCHOOL' OR NOT(${activeLearner}) THEN 'UNAVAILABLE'
 WHEN i.status='CONFIRMED' AND EXISTS(SELECT 1 FROM identity.school_family_relationships f
 WHERE f.invitation_id=i.id AND f.school_id=i.school_id AND f.learner_person_id=i.learner_person_id AND f.adult_person_id=$1 AND f.status='ACTIVE') THEN 'CONFIRMED'
 WHEN i.status='CLAIMED' AND ${activeIssuer} THEN 'PENDING_SCHOOL_REVIEW'
 ELSE 'UNAVAILABLE' END AS status,
 i.claimed_at AS "requestedAt",i.reviewed_at AS "reviewedAt",false AS "grantsLearnerAccess"
 FROM organisation.family_invitations i JOIN organisation.organisations o ON o.id=i.school_id
 WHERE i.claimed_by=$1 ORDER BY i.claimed_at DESC,i.id LIMIT 101 OFFSET $2`,[person,offset]);
 await db.query(`INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason)
 VALUES($1::uuid,'family.connections.list','FAMILY_CONNECTIONS',($1::uuid)::text,'ALLOW','owner_scoped_history')`,[person]);
 return {connections:result.rows.slice(0,100),nextOffset:result.rows.length>100?offset+100:null};
});}
export async function withdrawFamilyConnection(pool:Pool,person:string,id:string,value:unknown){withdrawConnectionInput.parse(value);return transaction(pool,async db=>{
 await activeOwner(db,person);
 const row=await db.query("SELECT id FROM organisation.family_invitations WHERE id=$1 AND claimed_by=$2 AND status IN ('CLAIMED','CONFIRMED') FOR UPDATE",[id,person]);
 if(!row.rows.length)throw new AdminError('FAMILY_CONNECTION_UNAVAILABLE',404);
 await db.query("UPDATE identity.school_family_relationships SET status='REVOKED',revoked_at=clock_timestamp() WHERE invitation_id=$1 AND adult_person_id=$2 AND status='ACTIVE'",[id,person]);
 await db.query("UPDATE organisation.family_invitations SET status='REVOKED',reviewed_by=$2,reviewed_at=clock_timestamp() WHERE id=$1",[id,person]);
 await db.query(`INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason)
 VALUES($1,'family.connection.withdraw','FAMILY_CONNECTION',$2::text,'ALLOW','owner_requested_withdrawal')`,[person,id]);
 return {status:'REVOKED' as const,grantsLearnerAccess:false as const};
});}
