import type {Pool,PoolClient} from 'pg';
import {AdminError,transaction,assertSchoolPrincipal} from '../school-admin/service';
import {billingGrantInput,billingAction,billingContractVersion,billingSettingsInput} from './contracts';
type Db=Pick<PoolClient,'query'>;
async function audit(db:Db,actor:string,action:string,id:string,decision='ALLOW',reason='current_family_billing_scope'){
 await db.query('INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason) VALUES($1,$2,\'FAMILY_BILLING\',$3,$4,$5)',[actor,action,id,decision,reason]);
}
const eligible=`f.status='ACTIVE' AND i.status='CONFIRMED' AND i.claimed_by=f.adult_person_id
 AND i.school_id=f.school_id AND i.learner_person_id=f.learner_person_id
 AND adult.status='ACTIVE' AND child.status='ACTIVE' AND o.status='ACTIVE' AND o.organisation_type='SCHOOL'
 AND lr.status='ACTIVE' AND lm.status='ACTIVE' AND lm.membership_type='LEARNER'
 AND lm.starts_at<=clock_timestamp() AND (lm.ends_at IS NULL OR lm.ends_at>clock_timestamp())`;
const joins=`FROM identity.school_family_relationships f
 JOIN organisation.family_invitations i ON i.id=f.invitation_id
 JOIN identity.persons adult ON adult.id=f.adult_person_id JOIN identity.persons child ON child.id=f.learner_person_id
 JOIN organisation.organisations o ON o.id=f.school_id
 JOIN organisation.learner_registrations lr ON lr.school_id=f.school_id AND lr.learner_person_id=f.learner_person_id
 JOIN organisation.memberships lm ON lm.person_id=f.learner_person_id AND lm.organisation_id=f.school_id AND lm.membership_type='LEARNER'`;
const currentIssuer=`EXISTS(SELECT 1 FROM identity.persons p JOIN organisation.memberships m ON m.person_id=p.id
 JOIN access.role_assignments ra ON ra.person_id=p.id AND ra.organisation_id=m.organisation_id JOIN access.roles r ON r.id=ra.role_id
 WHERE p.id=g.granted_by AND m.organisation_id=g.school_id AND p.status='ACTIVE' AND m.status='ACTIVE' AND m.membership_type='STAFF'
 AND m.starts_at<=clock_timestamp() AND (m.ends_at IS NULL OR m.ends_at>clock_timestamp())
 AND ra.status='ACTIVE' AND ra.starts_at<=clock_timestamp() AND (ra.ends_at IS NULL OR ra.ends_at>clock_timestamp()) AND r.code='PRINCIPAL')`;
export async function listSchoolBillingContacts(pool:Pool,actor:string,school:string){return transaction(pool,async db=>{
 await assertSchoolPrincipal(db,actor,school);
 const contacts=await db.query(`SELECT f.id AS "relationshipId",f.adult_person_id AS "adultPersonId",f.learner_person_id AS "learnerPersonId",
 COALESCE(an.given_name,'') AS "adultGivenName",COALESCE(an.family_name,'') AS "adultFamilyName",COALESCE(cn.given_name,'') AS "learnerGivenName",COALESCE(cn.family_name,'') AS "learnerFamilyName",lr.admission_number AS "learnerReference",
 g.id AS "grantId",g.actions,g.expires_at AS "expiresAt",CASE WHEN g.id IS NOT NULL AND g.expires_at>clock_timestamp() AND ${currentIssuer} THEN true ELSE false END AS "billingActive"
 ${joins} LEFT JOIN identity.person_names an ON an.person_id=f.adult_person_id LEFT JOIN identity.person_names cn ON cn.person_id=f.learner_person_id
 LEFT JOIN access.family_billing_grants g ON g.relationship_id=f.id AND g.status='ACTIVE'
 WHERE f.school_id=$1 AND ${eligible} ORDER BY f.confirmed_at DESC,f.id LIMIT 101`,[school]);
 await audit(db,actor,'family.billing.contacts.list',school);return {contacts:contacts.rows.slice(0,100),truncated:contacts.rows.length>100};
});}
export async function grantFamilyBilling(pool:Pool,actor:string,school:string,value:unknown){const input=billingGrantInput.parse(value);const expiry=Date.parse(input.expiresAt);if(expiry<=Date.now()||expiry>Date.now()+400*86400000)throw new AdminError('BILLING_EXPIRY_INVALID',400);
 return transaction(pool,async db=>{await assertSchoolPrincipal(db,actor,school);
  const rows=await db.query(`SELECT f.adult_person_id,f.learner_person_id ${joins} WHERE f.id=$1 AND f.school_id=$2 AND ${eligible} FOR UPDATE OF f,i`,[input.relationshipId,school]);const f=rows.rows[0];if(!f||f.adult_person_id===actor)throw new AdminError('BILLING_CONTACT_UNAVAILABLE',404);
  const existing=await db.query("SELECT id,actions,expires_at AS \"expiresAt\",granted_by FROM access.family_billing_grants WHERE relationship_id=$1 AND status='ACTIVE' FOR UPDATE",[input.relationshipId]);
  if(existing.rows[0]){const row=existing.rows[0];if(row.granted_by===actor&&JSON.stringify([...row.actions].sort())===JSON.stringify([...input.actions].sort())&&new Date(row.expiresAt).toISOString()===new Date(input.expiresAt).toISOString())return {id:row.id,status:'ACTIVE',replayed:true};throw new AdminError('BILLING_GRANT_EXISTS',409);}
  const result=await db.query('INSERT INTO access.family_billing_grants(relationship_id,school_id,adult_person_id,learner_person_id,actions,granted_by,expires_at) VALUES($1,$2,$3,$4,$5::text[],$6,$7) RETURNING id',[input.relationshipId,school,f.adult_person_id,f.learner_person_id,input.actions,actor,input.expiresAt]);
  await audit(db,actor,'family.billing.grant',result.rows[0].id);return {id:result.rows[0].id,status:'ACTIVE',replayed:false};
 });
}
export async function revokeFamilyBilling(pool:Pool,actor:string,id:string,school?:string){return transaction(pool,async db=>{
 if(school)await assertSchoolPrincipal(db,actor,school);
 const rows=await db.query(`SELECT id FROM access.family_billing_grants WHERE id=$1 AND ${school?'school_id=$2':'adult_person_id=$2'} FOR UPDATE`,[id,school??actor]);if(!rows.rowCount)throw new AdminError('BILLING_CONTACT_UNAVAILABLE',404);
 await db.query("UPDATE access.family_billing_grants SET status='REVOKED',revoked_by=COALESCE(revoked_by,$2),revoked_at=COALESCE(revoked_at,clock_timestamp()) WHERE id=$1",[id,actor]);await audit(db,actor,'family.billing.revoke',id);return {status:'REVOKED'};
});}
const allowedGrant=`g.status='ACTIVE' AND g.expires_at>clock_timestamp() AND g.adult_person_id=$1 AND g.school_id=f.school_id AND g.learner_person_id=f.learner_person_id AND g.adult_person_id=f.adult_person_id AND ${eligible} AND ${currentIssuer}`;
export async function listFamilyBilling(pool:Pool,person:string){return transaction(pool,async db=>{
 const rows=await db.query(`SELECT g.id AS "grantId",g.school_id AS "schoolId",g.learner_person_id AS "learnerPersonId",o.display_name AS "schoolName",lr.admission_number AS "learnerReference",COALESCE(n.given_name,'') AS "givenName",COALESCE(n.family_name,'') AS "familyName",g.actions,g.expires_at AS "expiresAt"
 ${joins} JOIN access.family_billing_grants g ON g.relationship_id=f.id LEFT JOIN identity.person_names n ON n.person_id=f.learner_person_id
 WHERE ${allowedGrant} ORDER BY lower(o.display_name),g.id LIMIT 101`,[person]);await audit(db,person,'family.billing.directory',person);return {contractVersion:billingContractVersion,scopes:rows.rows.slice(0,100),truncated:rows.rows.length>100};
});}
export async function authorizeFamilyBilling(pool:Pool,person:string,grantId:string,actionValue:unknown){const action=billingAction.parse(actionValue);return transaction(pool,async db=>{
 const rows=await db.query(`SELECT g.id,g.school_id,g.learner_person_id ${joins} JOIN access.family_billing_grants g ON g.relationship_id=f.id WHERE ${allowedGrant} AND g.id=$2 AND $3=ANY(g.actions)`,[person,grantId,action]);
 const row=rows.rows[0];if(!row){await audit(db,person,'family.billing.authorize',grantId,'DENY','family_billing_scope_unavailable');return null;}
 await audit(db,person,'family.billing.authorize',grantId);return {allowed:true as const,contractVersion:billingContractVersion,grantId:row.id,personId:person,schoolId:row.school_id,learnerPersonId:row.learner_person_id,action,expiresAt:new Date(Date.now()+30000).toISOString()};
});}

/** One user save; history is retained through an atomic grant replacement. */
export async function saveFamilyBillingSettings(pool:Pool,actor:string,school:string,value:unknown){
 const {settings:input,expectedGrantId}=billingSettingsInput.parse(value),expiry=Date.parse(input.expiresAt);
 if(expiry<=Date.now()||expiry>Date.now()+400*86400000)throw new AdminError('BILLING_EXPIRY_INVALID',400);
 return transaction(pool,async db=>{
  await assertSchoolPrincipal(db,actor,school);
  const contact=(await db.query(`SELECT f.adult_person_id,f.learner_person_id ${joins} WHERE f.id=$1 AND f.school_id=$2 AND ${eligible} FOR UPDATE OF f,i`,[input.relationshipId,school])).rows[0];
  if(!contact||contact.adult_person_id===actor)throw new AdminError('BILLING_CONTACT_UNAVAILABLE',404);
  const current=(await db.query("SELECT id,actions,expires_at,granted_by FROM access.family_billing_grants WHERE relationship_id=$1 AND status='ACTIVE' FOR UPDATE",[input.relationshipId])).rows[0];
  if(current&&current.granted_by===actor&&JSON.stringify([...current.actions].sort())===JSON.stringify([...input.actions].sort())&&new Date(current.expires_at).toISOString()===new Date(input.expiresAt).toISOString())return {id:current.id,status:'ACTIVE',replayed:true};
  if((current?.id??null)!==expectedGrantId)throw new AdminError('BILLING_SETTINGS_CHANGED',409);
  if(current){await db.query("UPDATE access.family_billing_grants SET status='REVOKED',revoked_by=$2,revoked_at=clock_timestamp() WHERE id=$1",[current.id,actor]);await audit(db,actor,'family.billing.revoke',current.id,'ALLOW','settings_replaced');}
  const row=(await db.query('INSERT INTO access.family_billing_grants(relationship_id,school_id,adult_person_id,learner_person_id,actions,granted_by,expires_at) VALUES($1,$2,$3,$4,$5::text[],$6,$7) RETURNING id',[input.relationshipId,school,contact.adult_person_id,contact.learner_person_id,input.actions,actor,input.expiresAt])).rows[0];
  await audit(db,actor,'family.billing.settings.save',row.id);return {id:row.id,status:'ACTIVE',replayed:false};
 });
}
