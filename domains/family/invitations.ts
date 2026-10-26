import {randomBytes} from 'node:crypto';
import type {Pool,PoolClient} from 'pg';
import {z} from 'zod';
import {AdminError,assertSchoolAdmin,audit,transaction,inviteTokenSchema} from '../school-admin/service';
import {hashBearerToken} from '../../platform/session/service';
export const familyInvitationInput=z.object({learnerPersonId:z.string().uuid().transform(v=>v.toLowerCase()),email:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),relationship:z.enum(['PARENT','GUARDIAN','CAREGIVER'])}).strict();
export const familyListQuery=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0),view:z.enum(['ALL','PENDING_REVIEW','AWAITING_PARENT','CONFIRMED']).default('ALL'),learnerPersonId:z.string().uuid().optional()}).strict();
export const familyClaimInput=z.object({token:inviteTokenSchema,acknowledgement:z.literal(true)}).strict();
export const familyReviewInput=z.discriminatedUnion('decision',[
 z.object({decision:z.literal('CONFIRM'),verifiedBySchool:z.literal(true)}).strict(),
 z.object({decision:z.literal('DECLINE')}).strict(),
 z.object({decision:z.literal('REVOKE')}).strict(),
]);
async function learner(db:PoolClient,school:string,person:string){
 const r=await db.query(`SELECT r.id FROM organisation.learner_registrations r JOIN identity.persons p ON p.id=r.learner_person_id
 JOIN organisation.memberships m ON m.person_id=p.id AND m.organisation_id=r.school_id AND m.membership_type='LEARNER'
 WHERE r.school_id=$1 AND p.id=$2 AND r.status='ACTIVE' AND p.status='ACTIVE' AND m.status='ACTIVE'
 AND m.starts_at<=clock_timestamp() AND (m.ends_at IS NULL OR m.ends_at>clock_timestamp()) FOR SHARE OF r,p,m`,[school,person]);
 if(!r.rows.length)throw new AdminError('LEARNER_UNAVAILABLE',404);
}
async function activePerson(db:PoolClient,person:string){if(!(await db.query("SELECT id FROM identity.persons WHERE id=$1 AND status='ACTIVE' FOR SHARE",[person])).rows.length)throw new AdminError('ACTIVE_PERSON_REQUIRED');}
export async function createFamilyInvitation(pool:Pool,actor:string,school:string,value:unknown){const input=familyInvitationInput.parse(value);return transaction(pool,async db=>{
 await assertSchoolAdmin(db,actor,school);await learner(db,school,input.learnerPersonId);
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['family-invite',school,input.learnerPersonId,input.email])]);
 await db.query("UPDATE organisation.family_invitations SET status='EXPIRED' WHERE school_id=$1 AND learner_person_id=$2 AND email=$3 AND status IN ('ISSUED','CLAIMED') AND expires_at<=clock_timestamp()",[school,input.learnerPersonId,input.email]);
 if((await db.query("SELECT id FROM organisation.family_invitations WHERE school_id=$1 AND learner_person_id=$2 AND email=$3 AND status IN ('ISSUED','CLAIMED')",[school,input.learnerPersonId,input.email])).rows.length)throw new AdminError('INVITATION_ALREADY_PENDING',409);
 const token=randomBytes(32).toString('base64url');const r=await db.query(`INSERT INTO organisation.family_invitations(school_id,learner_person_id,email,relationship,token_hash,created_by)
 VALUES($1,$2,$3,$4,$5,$6) RETURNING id,expires_at AS "expiresAt"`,[school,input.learnerPersonId,input.email,input.relationship,hashBearerToken(token),actor]);
 await audit(db,actor,'school.family_invitation.create',school,r.rows[0].id);return {...r.rows[0],token,emailStatus:'NOT_SENT' as const};
});}
export async function listFamilyInvitations(pool:Pool,actor:string,school:string,offset=0,view:'ALL'|'PENDING_REVIEW'|'AWAITING_PARENT'|'CONFIRMED'='ALL',learnerPersonId?:string){return transaction(pool,async db=>{
 await assertSchoolAdmin(db,actor,school);const r=await db.query(`SELECT id,learner_person_id AS "learnerPersonId",(SELECT admission_number FROM organisation.learner_registrations r WHERE r.school_id=organisation.family_invitations.school_id AND r.learner_person_id=organisation.family_invitations.learner_person_id) AS "admissionNumber",email,relationship,
 CASE WHEN status IN ('ISSUED','CLAIMED') AND expires_at<=clock_timestamp() THEN 'EXPIRED' ELSE status END AS status,
 expires_at AS "expiresAt",claimed_at AS "claimedAt",reviewed_at AS "reviewedAt" FROM organisation.family_invitations WHERE school_id=$1 AND ($4::uuid IS NULL OR learner_person_id=$4::uuid) AND ($3='ALL' OR($3='PENDING_REVIEW' AND status='CLAIMED' AND expires_at>clock_timestamp()) OR($3='AWAITING_PARENT' AND status='ISSUED' AND expires_at>clock_timestamp()) OR($3='CONFIRMED' AND status='CONFIRMED')) ORDER BY created_at DESC,id LIMIT 101 OFFSET $2`,[school,offset,view,learnerPersonId??null]);
 await audit(db,actor,'school.family_invitation.list',school,school);return {invitations:r.rows.slice(0,100),nextOffset:r.rows.length>100?offset+100:null};
});}
export async function claimFamilyInvitation(pool:Pool,person:string,verifiedEmail:string,value:unknown){const {token}=familyClaimInput.parse(value);return transaction(pool,async db=>{
 const r=await db.query(`SELECT i.*,o.display_name FROM organisation.family_invitations i JOIN organisation.organisations o ON o.id=i.school_id
 WHERE i.token_hash=$1 AND i.status IN ('ISSUED','CLAIMED') AND i.expires_at>clock_timestamp() AND o.status='ACTIVE' AND o.organisation_type='SCHOOL' FOR UPDATE OF i`,[hashBearerToken(token)]);
 const i=r.rows[0];if(!i)throw new AdminError('INVITATION_UNAVAILABLE',410);
 if(i.email!==verifiedEmail.toLowerCase())throw new AdminError('INVITED_EMAIL_REQUIRED');
 await assertSchoolAdmin(db,i.created_by,i.school_id);await learner(db,i.school_id,i.learner_person_id);await activePerson(db,person);
 if(person===i.learner_person_id)throw new AdminError('FAMILY_CONTACT_REQUIRED');
 if(i.claimed_by&&i.claimed_by!==person)throw new AdminError('INVITATION_UNAVAILABLE',410);
 if(!i.claimed_by){const claimed=await db.query("UPDATE organisation.family_invitations SET status='CLAIMED',claimed_by=$2,claimed_at=clock_timestamp() WHERE id=$1 AND expires_at>clock_timestamp() RETURNING id",[i.id,person]);if(!claimed.rows.length)throw new AdminError('INVITATION_UNAVAILABLE',410);await audit(db,person,'school.family_invitation.claim',i.school_id,i.id);}
 return {id:i.id,schoolName:i.display_name,status:'PENDING_SCHOOL_REVIEW' as const,grantsLearnerAccess:false as const};
});}
export async function reviewFamilyInvitation(pool:Pool,actor:string,school:string,id:string,value:unknown){const input=familyReviewInput.parse(value);return transaction(pool,async db=>{
 await assertSchoolAdmin(db,actor,school);const r=await db.query('SELECT * FROM organisation.family_invitations WHERE id=$1 AND school_id=$2 FOR UPDATE',[id,school]);const i=r.rows[0];if(!i)throw new AdminError('INVITATION_UNAVAILABLE',404);
 if(input.decision==='REVOKE'){
 if(!['ISSUED','CLAIMED','CONFIRMED'].includes(i.status))throw new AdminError('INVITATION_UNAVAILABLE',409);
 await db.query("UPDATE identity.school_family_relationships SET status='REVOKED',revoked_at=clock_timestamp() WHERE invitation_id=$1 AND status='ACTIVE'",[id]);
 await db.query("UPDATE organisation.family_invitations SET status='REVOKED',reviewed_by=$2,reviewed_at=clock_timestamp() WHERE id=$1",[id,actor]);
 }else{
 if(i.status!=='CLAIMED'||new Date(i.expires_at).getTime()<=Date.now())throw new AdminError('INVITATION_UNAVAILABLE',410);
 await assertSchoolAdmin(db,i.created_by,school);await learner(db,school,i.learner_person_id);await activePerson(db,i.claimed_by);
 if(actor===i.claimed_by||(input.decision==='CONFIRM'&&actor===i.created_by))throw new AdminError('INDEPENDENT_REVIEW_REQUIRED');
 if(input.decision==='CONFIRM'){
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[JSON.stringify(['family-link',school,i.learner_person_id,i.claimed_by])]);
 const existing=await db.query("SELECT id FROM identity.school_family_relationships WHERE school_id=$1 AND learner_person_id=$2 AND adult_person_id=$3 AND status='ACTIVE'",[school,i.learner_person_id,i.claimed_by]);
 if(existing.rows.length)throw new AdminError('FAMILY_LINK_ALREADY_ACTIVE',409);
 await db.query('INSERT INTO identity.school_family_relationships(invitation_id,school_id,learner_person_id,adult_person_id,relationship,confirmed_by) VALUES($1,$2,$3,$4,$5,$6)',[id,school,i.learner_person_id,i.claimed_by,i.relationship,actor]);
 }
 const reviewed=await db.query('UPDATE organisation.family_invitations SET status=$2,reviewed_by=$3,reviewed_at=clock_timestamp() WHERE id=$1 AND expires_at>clock_timestamp() RETURNING id',[id,input.decision==='CONFIRM'?'CONFIRMED':'DECLINED',actor]);if(!reviewed.rows.length)throw new AdminError('INVITATION_UNAVAILABLE',410);
 }
 await audit(db,actor,`school.family_invitation.${input.decision.toLowerCase()}`,school,id);return {status:input.decision==='CONFIRM'?'CONFIRMED':input.decision==='DECLINE'?'DECLINED':'REVOKED',grantsLearnerAccess:false};
});}

/** Recover sharing by rotating a still-issued token. No plaintext token recovery, expiry extension or role grant. */
export async function replaceFamilyInvitation(pool:Pool,actor:string,school:string,id:string){return transaction(pool,async db=>{
 await assertSchoolAdmin(db,actor,school);
 const result=await db.query('SELECT * FROM organisation.family_invitations WHERE id=$1 AND school_id=$2 FOR UPDATE',[id,school]);const i=result.rows[0];
 if(!i||i.status!=='ISSUED'||new Date(i.expires_at).getTime()<=Date.now())throw new AdminError('INVITATION_UNAVAILABLE',410);
 await assertSchoolAdmin(db,i.created_by,school);await learner(db,school,i.learner_person_id);
 const token=randomBytes(32).toString('base64url');
 const updated=await db.query(`UPDATE organisation.family_invitations SET token_hash=$2 WHERE id=$1 AND status='ISSUED' AND expires_at>clock_timestamp() RETURNING id,email,expires_at AS "expiresAt"`,[id,hashBearerToken(token)]);
 if(!updated.rows.length)throw new AdminError('INVITATION_UNAVAILABLE',410);
 await audit(db,actor,'school.family_invitation.replace',school,id);
 return {...updated.rows[0],token,emailStatus:'NOT_SENT' as const};
});}
