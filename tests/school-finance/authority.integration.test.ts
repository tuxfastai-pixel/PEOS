import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {Pool} from 'pg';
import {acceptInvitation,assertSchoolAdmin,createInvitation} from '../../domains/school-admin/service';import {financeSchools,financeContext,financeLearners,listFinanceStaff,revokeFinanceStaff} from '../../domains/school-finance/authority';
test('finance is principal-delegated, purpose-scoped and immediately revocable without teacher/admin/founder inheritance',{skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const people=Array.from({length:7},()=>randomUUID()),schools=[randomUUID(),randomUUID()];const [principal,officer,admin,teacher,founder,child,otherChild]=people,[school,otherSchool]=schools;
 try{
  for(const id of people)await pool.query('INSERT INTO identity.persons(id) VALUES($1)',[id]);
  for(const id of schools)await pool.query("INSERT INTO organisation.organisations(id,organisation_type,display_name) VALUES($1,'SCHOOL','CI finance authority')",[id]);
  for(const [person,role] of [[principal,'PRINCIPAL'],[admin,'SCHOOL_ADMINISTRATOR'],[teacher,'TEACHER']]){
   await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'STAFF')",[person,school]);await pool.query('INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code=$3',[person,school,role]);
  }
  await pool.query("INSERT INTO access.role_assignments(person_id,role_id) SELECT $1,id FROM access.roles WHERE code='SPACECASE_FOUNDER'",[founder]);
  for(let i=0;i<2;i++){const person=[child,otherChild][i],s=schools[i];await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'LEARNER')",[person,s]);await pool.query("INSERT INTO identity.person_names(person_id,given_name,family_name) VALUES($1,'Example','Learner')",[person]);await pool.query('INSERT INTO organisation.learner_registrations(school_id,learner_person_id,admission_number,created_by) VALUES($1,$2,$3,$4)',[s,person,'REF-'+i,principal]);}
  const input={email:'finance@example.test',roleCode:'SCHOOL_FINANCE_OFFICER' as const};await assert.rejects(createInvitation(pool,admin,school,input),/SCHOOL_PRINCIPAL_REQUIRED/);
  const invite=await createInvitation(pool,principal,school,input);await acceptInvitation(pool,officer,input.email,invite.token);
  const context=await financeContext(pool,officer,school,child);assert.equal(context.principal,false);assert.equal(context.learner?.admissionNumber,'REF-0');
  assert.equal((await financeContext(pool,principal,school)).principal,true);assert.equal((await financeSchools(pool,officer)).schools.length,1);
  for(const person of [admin,teacher,founder])await assert.rejects(financeContext(pool,person,school),/SCHOOL_FINANCE_REQUIRED/);
  assert.equal((await financeSchools(pool,founder)).schools.length,0);await assert.rejects(financeContext(pool,officer,otherSchool),/SCHOOL_FINANCE_REQUIRED/);
  await assert.rejects(assertSchoolAdmin(pool,officer,school),/SCHOOL_ADMIN_REQUIRED/);
  assert.equal((await financeLearners(pool,officer,school,'REF',0)).learners.length,1);
  await assert.rejects(financeContext(pool,officer,school,otherChild),/LEARNER_UNAVAILABLE/);
  await assert.rejects(listFinanceStaff(pool,admin,school),/SCHOOL_PRINCIPAL_REQUIRED/);
  assert.equal((await listFinanceStaff(pool,principal,school)).staff[0].personId,officer);
  await pool.query("UPDATE access.role_assignments SET starts_at=now()+interval '1 day' WHERE person_id=$1 AND organisation_id=$2",[officer,school]);await assert.rejects(financeContext(pool,officer,school),/SCHOOL_FINANCE_REQUIRED/);await pool.query("UPDATE access.role_assignments SET starts_at=now()-interval '1 minute' WHERE person_id=$1",[officer]);
  await revokeFinanceStaff(pool,principal,school,officer);await assert.rejects(financeContext(pool,officer,school),/SCHOOL_FINANCE_REQUIRED/);assert.equal((await financeSchools(pool,officer)).schools.length,0);
  const pending=await createInvitation(pool,principal,school,{...input,email:'other-finance@example.test'});await pool.query("UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1",[principal]);await assert.rejects(acceptInvitation(pool,officer,'other-finance@example.test',pending.token),/SCHOOL_ADMIN_REQUIRED/);
 }finally{
  await pool.query('DELETE FROM organisation.staff_invitations WHERE school_id=ANY($1::uuid[])',[schools]);await pool.query('DELETE FROM organisation.learner_registrations WHERE school_id=ANY($1::uuid[])',[schools]);await pool.query('DELETE FROM identity.person_names WHERE person_id=ANY($1::uuid[])',[people]);await pool.query('DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])',[people]);await pool.query('DELETE FROM organisation.memberships WHERE organisation_id=ANY($1::uuid[])',[schools]);await pool.query('DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])',[people]);await pool.query('DELETE FROM organisation.organisations WHERE id=ANY($1::uuid[])',[schools]);await pool.query('DELETE FROM identity.persons WHERE id=ANY($1::uuid[])',[people]);await pool.end();
 }
});
