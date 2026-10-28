import type {Pool,PoolClient} from 'pg';import {z} from 'zod';import {AdminError,assertSchoolPrincipal,audit,transaction} from '../school-admin/service';
export const financeRosterQuery=z.object({q:z.string().trim().max(100).default(''),offset:z.coerce.number().int().min(0).max(1000000).default(0)}).strict();
export async function assertSchoolFinance(db:PoolClient,actor:string,schoolId:string){
 const r=await db.query(`SELECT o.id,o.display_name AS "displayName",role.code FROM organisation.organisations o
 JOIN organisation.memberships m ON m.organisation_id=o.id JOIN identity.persons p ON p.id=m.person_id
 JOIN access.role_assignments ra ON ra.person_id=p.id AND ra.organisation_id=o.id JOIN access.roles role ON role.id=ra.role_id
 WHERE o.id=$2 AND p.id=$1 AND o.organisation_type='SCHOOL' AND o.status='ACTIVE' AND p.status='ACTIVE'
 AND m.membership_type='STAFF' AND m.status='ACTIVE' AND m.starts_at<=now() AND(m.ends_at IS NULL OR m.ends_at>now())
 AND ra.status='ACTIVE' AND ra.starts_at<=now() AND(ra.ends_at IS NULL OR ra.ends_at>now())
 AND role.code IN ('PRINCIPAL','SCHOOL_FINANCE_OFFICER') FOR SHARE OF o,m,p,ra`,[actor,schoolId]);
 if(!r.rowCount)throw new AdminError('SCHOOL_FINANCE_REQUIRED');
 return {personId:actor,schoolId,displayName:r.rows[0].displayName as string,principal:r.rows.some(row=>row.code==='PRINCIPAL')};
}
export async function financeSchools(pool:Pool,actor:string){return transaction(pool,async db=>{
 const person=await db.query("SELECT id FROM identity.persons WHERE id=$1 AND status='ACTIVE' FOR SHARE",[actor]);if(!person.rowCount)throw new AdminError('ACTIVE_PERSON_REQUIRED');
 const r=await db.query(`SELECT o.id,o.display_name AS "displayName",bool_or(role.code='PRINCIPAL') AS principal FROM organisation.organisations o
 JOIN organisation.memberships m ON m.organisation_id=o.id JOIN access.role_assignments ra ON ra.person_id=m.person_id AND ra.organisation_id=o.id JOIN access.roles role ON role.id=ra.role_id
 WHERE m.person_id=$1 AND o.organisation_type='SCHOOL' AND o.status='ACTIVE' AND m.membership_type='STAFF' AND m.status='ACTIVE'
 AND m.starts_at<=now() AND(m.ends_at IS NULL OR m.ends_at>now()) AND ra.status='ACTIVE' AND ra.starts_at<=now() AND(ra.ends_at IS NULL OR ra.ends_at>now())
 AND role.code IN ('PRINCIPAL','SCHOOL_FINANCE_OFFICER') GROUP BY o.id,o.display_name ORDER BY lower(o.display_name),o.id LIMIT 201`,[actor]);
 if(r.rows.length>200)throw new AdminError('FINANCE_SCOPE_LIMIT');
 return {personId:actor,schools:r.rows};
});}
async function currentLearner(db:PoolClient,schoolId:string,personId:string){const r=await db.query(`SELECT p.id AS "personId",reg.admission_number AS "admissionNumber" FROM identity.persons p
 JOIN organisation.learner_registrations reg ON reg.learner_person_id=p.id JOIN organisation.memberships m ON m.person_id=p.id AND m.organisation_id=reg.school_id
 WHERE reg.school_id=$1 AND p.id=$2 AND p.status='ACTIVE' AND reg.status='ACTIVE' AND m.membership_type='LEARNER' AND m.status='ACTIVE'
 AND m.starts_at<=now() AND(m.ends_at IS NULL OR m.ends_at>now()) FOR SHARE OF p,reg,m`,[schoolId,personId]);if(!r.rowCount)throw new AdminError('LEARNER_UNAVAILABLE',404);return r.rows[0];}
export async function financeContext(pool:Pool,actor:string,schoolId:string,learnerPersonId?:string){return transaction(pool,async db=>{const context=await assertSchoolFinance(db,actor,schoolId);const learner=learnerPersonId?await currentLearner(db,schoolId,learnerPersonId):null;await audit(db,actor,'school.finance.context',schoolId,schoolId);return {...context,learner};});}
export async function financeLearners(pool:Pool,actor:string,schoolId:string,q:string,offset:number){return transaction(pool,async db=>{
 await assertSchoolFinance(db,actor,schoolId);
 const r=await db.query(`SELECT p.id AS "personId",reg.admission_number AS "admissionNumber",n.given_name AS "givenName",n.family_name AS "familyName" FROM organisation.learner_registrations reg
 JOIN identity.persons p ON p.id=reg.learner_person_id JOIN identity.person_names n ON n.person_id=p.id
 JOIN organisation.memberships m ON m.person_id=p.id AND m.organisation_id=reg.school_id AND m.membership_type='LEARNER'
 WHERE reg.school_id=$1 AND reg.status='ACTIVE' AND p.status='ACTIVE' AND m.status='ACTIVE' AND m.starts_at<=now() AND(m.ends_at IS NULL OR m.ends_at>now())
 AND($2='' OR strpos(lower(reg.admission_number||' '||n.given_name||' '||n.family_name),lower($2))>0)
 ORDER BY lower(n.family_name),lower(n.given_name),p.id LIMIT 51 OFFSET $3`,[schoolId,q,offset]);await audit(db,actor,'school.finance.learner_search',schoolId,schoolId);return {learners:r.rows.slice(0,50),nextOffset:r.rows.length>50?offset+50:null};
});}
export async function listFinanceStaff(pool:Pool,actor:string,schoolId:string){return transaction(pool,async db=>{
 await assertSchoolPrincipal(db,actor,schoolId);
 const r=await db.query(`SELECT DISTINCT p.id AS "personId",(SELECT i.email FROM organisation.staff_invitations i WHERE i.school_id=$1 AND i.accepted_by=p.id AND i.role_code='SCHOOL_FINANCE_OFFICER' AND i.accepted_at IS NOT NULL ORDER BY i.accepted_at DESC LIMIT 1) AS "invitationEmail" FROM access.role_assignments ra JOIN access.roles role ON role.id=ra.role_id JOIN identity.persons p ON p.id=ra.person_id JOIN organisation.memberships m ON m.person_id=p.id AND m.organisation_id=ra.organisation_id
 WHERE ra.organisation_id=$1 AND role.code='SCHOOL_FINANCE_OFFICER' AND ra.status='ACTIVE' AND ra.starts_at<=now() AND(ra.ends_at IS NULL OR ra.ends_at>now()) AND p.status='ACTIVE'
 AND m.membership_type='STAFF' AND m.status='ACTIVE' AND m.starts_at<=now() AND(m.ends_at IS NULL OR m.ends_at>now()) ORDER BY p.id LIMIT 201`,[schoolId]);if(r.rows.length>200)throw new AdminError('FINANCE_SCOPE_LIMIT');await audit(db,actor,'school.finance.staff_list',schoolId,schoolId);return {staff:r.rows};
});}
export async function revokeFinanceStaff(pool:Pool,actor:string,schoolId:string,personId:string){return transaction(pool,async db=>{
 await assertSchoolPrincipal(db,actor,schoolId);const r=await db.query(`UPDATE access.role_assignments SET status='ENDED',ends_at=now() WHERE person_id=$1 AND organisation_id=$2 AND status='ACTIVE' AND role_id=(SELECT id FROM access.roles WHERE code='SCHOOL_FINANCE_OFFICER') RETURNING id`,[personId,schoolId]);if(!r.rowCount)throw new AdminError('FINANCE_STAFF_UNAVAILABLE',404);await audit(db,actor,'school.finance.staff_revoke',schoolId,personId);return {revoked:true};
});}
