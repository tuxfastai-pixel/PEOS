import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {Pool} from 'pg';
import {submitRegistration,listMyRegistrations,withdrawRegistration,listRegistrationQueue,registrationDetail,reviewRegistration} from '../../domains/school-registration/service';import {emptySchoolProfile} from '../../domains/school-admin/schoolProfile';
test('school registration is private, idempotent, independently reviewed, revocable and never grants roles',{skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const people=[randomUUID(),randomUUID(),randomUUID()];const [applicant,outsider,founder]=people;let createdId='';
 try{
  for(const id of people)await pool.query('INSERT INTO identity.persons(id) VALUES($1)',[id]);
  await pool.query("INSERT INTO access.role_assignments(person_id,role_id) SELECT $1,id FROM access.roles WHERE code='SPACECASE_FOUNDER'",[founder]);
  const {revision,...profile}=emptySchoolProfile;void revision;
  const input={submissionKey:randomUUID(),schoolName:'CI registration '+randomUUID(),applicantRole:'ADMINISTRATOR',principalEmail:'principal@example.test',profile,acknowledged:true};
  const parallel=await Promise.all([1,2].map(()=>submitRegistration(pool,applicant,input)));assert.equal(parallel[0].id,parallel[1].id);createdId=parallel[0].id;
  await assert.rejects(submitRegistration(pool,applicant,{...input,schoolName:'Changed'}),/SUBMISSION_KEY_CONFLICT/);
  await assert.rejects(submitRegistration(pool,applicant,{...input,submissionKey:randomUUID()}),/REGISTRATION_ALREADY_PENDING/);
  assert.equal((await listMyRegistrations(pool,outsider,0)).requests.length,0);
  assert.equal((await listMyRegistrations(pool,applicant,0)).requests[0].id,createdId);
  await assert.rejects(withdrawRegistration(pool,outsider,createdId,1),/REGISTRATION_CHANGED_OR_UNAVAILABLE/);
  await assert.rejects(listRegistrationQueue(pool,applicant,0),/FOUNDER_REQUIRED/);
  await assert.rejects(registrationDetail(pool,applicant,createdId),/FOUNDER_REQUIRED/);
  const detail=await registrationDetail(pool,founder,createdId);assert.equal(detail.grantsAuthority,false);assert.equal(detail.request.principalEmail,input.principalEmail);
  assert.equal('principalEmail' in (await listRegistrationQueue(pool,founder,0)).requests.find(r=>r.id===createdId)!,false);
  const reviewed=await reviewRegistration(pool,founder,createdId,{revision:1,action:'START_REVIEW',message:''});assert.equal(reviewed.request.status,'IN_REVIEW');assert.equal(reviewed.grantsAuthority,false);
  await assert.rejects(reviewRegistration(pool,founder,createdId,{revision:1,action:'DECLINE',message:'stale'}),/REGISTRATION_CHANGED_OR_UNAVAILABLE/);
  const info=await reviewRegistration(pool,founder,createdId,{revision:2,action:'REQUEST_INFORMATION',message:'Please contact your pilot coordinator to verify school authority.'});assert.equal(info.request.status,'MORE_INFORMATION_REQUIRED');
  const withdrawn=await withdrawRegistration(pool,applicant,createdId,3);assert.equal(withdrawn.status,'WITHDRAWN');
  await assert.rejects(reviewRegistration(pool,founder,createdId,{revision:4,action:'START_REVIEW',message:''}),/REGISTRATION_STATE_CONFLICT/);
  const self=await submitRegistration(pool,founder,{...input,submissionKey:randomUUID(),schoolName:'Founder application '+randomUUID()});
  await assert.rejects(reviewRegistration(pool,founder,self.id,{revision:1,action:'START_REVIEW',message:''}),/INDEPENDENT_REVIEW_REQUIRED/);
  assert.equal((await pool.query('SELECT id FROM access.role_assignments WHERE person_id=ANY($1::uuid[])',[[applicant,outsider]])).rowCount,0);
  assert.equal((await pool.query('SELECT id FROM organisation.memberships WHERE person_id=ANY($1::uuid[])',[people])).rowCount,0);
  const metadata=JSON.stringify((await pool.query("SELECT metadata FROM audit.events WHERE resource_type='SCHOOL_REGISTRATION' AND actor_person_id=ANY($1::uuid[])",[people])).rows);assert.equal(metadata.includes(input.principalEmail),false);
  await pool.query("UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1",[founder]);await assert.rejects(listRegistrationQueue(pool,founder,0),/FOUNDER_REQUIRED/);
 }finally{
  await pool.query('DELETE FROM organisation.school_registration_requests WHERE requester_person_id=ANY($1::uuid[])',[people]);
  await pool.query('DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])',[people]);await pool.query('DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])',[people]);await pool.query('DELETE FROM identity.persons WHERE id=ANY($1::uuid[])',[people]);await pool.end();
 }
});
