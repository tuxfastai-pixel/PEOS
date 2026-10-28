import {z} from 'zod';
import type {Pool,PoolClient} from 'pg';
import {AdminError,transaction} from '../school-admin/service';
import {schoolProfileSchema} from '../school-admin/schoolProfile';
import {assertFounder} from '../founder/service';

export const registrationInput=z.object({submissionKey:z.string().uuid(),schoolName:z.string().trim().min(2).max(120),applicantRole:z.enum(['PRINCIPAL','ADMINISTRATOR']),principalEmail:z.string().trim().email().max(254).transform(v=>v.toLowerCase()),profile:schoolProfileSchema.omit({revision:true}),acknowledged:z.literal(true)}).strict();
export const requestId=z.string().uuid();
export const pageInput=z.object({offset:z.coerce.number().int().min(0).max(1000000).default(0)}).strict();
export const reviewInput=z.object({revision:z.number().int().positive(),action:z.enum(['START_REVIEW','REQUEST_INFORMATION','DECLINE']),message:z.string().trim().max(500)}).strict().superRefine((v,c)=>{if(v.action!=='START_REVIEW'&&!v.message)c.addIssue({code:z.ZodIssueCode.custom,message:'Explain the next step',path:['message']});});
export const withdrawInput=z.object({revision:z.number().int().positive()}).strict();
const activeStatuses=['SUBMITTED','IN_REVIEW','MORE_INFORMATION_REQUIRED'];
const summary=`id, school_name AS "schoolName", applicant_role AS "applicantRole", status,revision,review_message AS "reviewMessage",created_at AS "createdAt",updated_at AS "updatedAt"`;
async function activePerson(db:PoolClient,actor:string){const r=await db.query("SELECT id FROM identity.persons WHERE id=$1 AND status='ACTIVE' FOR UPDATE",[actor]);if(!r.rowCount)throw new AdminError('ACTIVE_PERSON_REQUIRED');}
async function audit(db:PoolClient,actor:string,action:string,id?:string){await db.query(`INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason) VALUES($1,$2,'SCHOOL_REGISTRATION',$3,'ALLOW','registration_intake_does_not_grant_authority')`,[actor,action,id??null]);}

export async function submitRegistration(pool:Pool,actor:string,value:unknown){const input=registrationInput.parse(value);return transaction(pool,async db=>{
 await activePerson(db,actor);
 const prior=await db.query(`SELECT ${summary},principal_email,proposed_profile FROM organisation.school_registration_requests WHERE requester_person_id=$1 AND submission_key=$2`,[actor,input.submissionKey]);
 if(prior.rowCount){const p=prior.rows[0];if(p.schoolName!==input.schoolName||p.applicantRole!==input.applicantRole||p.principal_email!==input.principalEmail||JSON.stringify(registrationInput.shape.profile.parse(p.proposed_profile))!==JSON.stringify(input.profile))throw new AdminError('SUBMISSION_KEY_CONFLICT',409);await audit(db,actor,'school.registration.retry',p.id);const {principal_email:unusedEmail,proposed_profile:unusedProfile,...result}=p;void unusedEmail;void unusedProfile;return result;}
 const count=await db.query(`SELECT count(*) FILTER(WHERE status=ANY($2::text[]))::int AS active,count(*) FILTER(WHERE created_at>now()-interval '24 hours')::int AS recent FROM organisation.school_registration_requests WHERE requester_person_id=$1`,[actor,activeStatuses]);
 if(count.rows[0].active>=5||count.rows[0].recent>=25)throw new AdminError('REGISTRATION_LIMIT',429);
 const duplicate=await db.query(`SELECT id FROM organisation.school_registration_requests WHERE requester_person_id=$1 AND lower(school_name)=lower($2) AND status=ANY($3::text[])`,[actor,input.schoolName,activeStatuses]);
 if(duplicate.rowCount)throw new AdminError('REGISTRATION_ALREADY_PENDING',409);
 const r=await db.query(`INSERT INTO organisation.school_registration_requests(requester_person_id,submission_key,school_name,applicant_role,principal_email,proposed_profile) VALUES($1,$2,$3,$4,$5,$6::jsonb) RETURNING ${summary}`,[actor,input.submissionKey,input.schoolName,input.applicantRole,input.principalEmail,JSON.stringify(input.profile)]);
 await audit(db,actor,'school.registration.submit',r.rows[0].id);return r.rows[0];
});}
export async function listMyRegistrations(pool:Pool,actor:string,offset:number){return transaction(pool,async db=>{await activePerson(db,actor);const r=await db.query(`SELECT ${summary} FROM organisation.school_registration_requests WHERE requester_person_id=$1 ORDER BY created_at DESC,id LIMIT 51 OFFSET $2`,[actor,offset]);return {requests:r.rows.slice(0,50),nextOffset:r.rows.length>50?offset+50:null};});}
export async function withdrawRegistration(pool:Pool,actor:string,id:string,revision:number){return transaction(pool,async db=>{await activePerson(db,actor);const r=await db.query(`UPDATE organisation.school_registration_requests SET status='WITHDRAWN',revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 AND requester_person_id=$2 AND revision=$3 AND status=ANY($4::text[]) RETURNING ${summary}`,[id,actor,revision,activeStatuses]);if(!r.rowCount)throw new AdminError('REGISTRATION_CHANGED_OR_UNAVAILABLE',409);await audit(db,actor,'school.registration.withdraw',id);return r.rows[0];});}
export async function listRegistrationQueue(pool:Pool,actor:string,offset:number){return transaction(pool,async db=>{await assertFounder(db,actor);const r=await db.query(`SELECT ${summary} FROM organisation.school_registration_requests ORDER BY CASE WHEN status IN ('SUBMITTED','IN_REVIEW','MORE_INFORMATION_REQUIRED') THEN 0 ELSE 1 END,created_at,id LIMIT 51 OFFSET $1`,[offset]);await audit(db,actor,'school.registration.queue');return {requests:r.rows.slice(0,50),nextOffset:r.rows.length>50?offset+50:null};});}
export async function registrationDetail(pool:Pool,actor:string,id:string){return transaction(pool,async db=>{
 await assertFounder(db,actor);const r=await db.query(`SELECT ${summary}, principal_email AS "principalEmail",proposed_profile AS profile,requester_person_id AS "requesterPersonId" FROM organisation.school_registration_requests WHERE id=$1`,[id]);if(!r.rowCount)throw new AdminError('REGISTRATION_UNAVAILABLE',404);
 const request=r.rows[0];const profile=registrationInput.shape.profile.parse(request.profile);
 const candidates=await db.query(`SELECT o.id,o.display_name AS "displayName" FROM organisation.organisations o LEFT JOIN organisation.school_profiles p ON p.school_id=o.id WHERE o.organisation_type='SCHOOL' AND (lower(o.display_name)=lower($1) OR ($2<>'' AND lower(p.emis_number)=lower($2))) ORDER BY o.id LIMIT 10`,[request.schoolName,profile.emisNumber]);
 await audit(db,actor,'school.registration.detail',id);return {request,possibleExistingSchools:candidates.rows,grantsAuthority:false};
});}
export async function reviewRegistration(pool:Pool,actor:string,id:string,value:unknown){const input=reviewInput.parse(value);return transaction(pool,async db=>{
 await assertFounder(db,actor);const r=await db.query('SELECT requester_person_id,status,revision FROM organisation.school_registration_requests WHERE id=$1 FOR UPDATE',[id]);if(!r.rowCount)throw new AdminError('REGISTRATION_UNAVAILABLE',404);const existing=r.rows[0];
 if(existing.requester_person_id===actor)throw new AdminError('INDEPENDENT_REVIEW_REQUIRED');
 if(existing.revision!==input.revision)throw new AdminError('REGISTRATION_CHANGED_OR_UNAVAILABLE',409);
 if(!activeStatuses.includes(existing.status)||(input.action==='START_REVIEW'&&existing.status==='IN_REVIEW')||(input.action==='REQUEST_INFORMATION'&&existing.status!=='IN_REVIEW'))throw new AdminError('REGISTRATION_STATE_CONFLICT',409);
 const status=input.action==='START_REVIEW'?'IN_REVIEW':input.action==='REQUEST_INFORMATION'?'MORE_INFORMATION_REQUIRED':'DECLINED';
 const updated=await db.query(`UPDATE organisation.school_registration_requests SET status=$2,review_message=$3,revision=revision+1,updated_at=clock_timestamp() WHERE id=$1 RETURNING ${summary}`,[id,status,input.message]);await audit(db,actor,`school.registration.${input.action.toLowerCase()}`,id);return {request:updated.rows[0],grantsAuthority:false};
});}
