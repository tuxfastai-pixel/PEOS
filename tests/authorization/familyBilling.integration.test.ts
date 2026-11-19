import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {Pool} from 'pg';
import {createFamilyInvitation,claimFamilyInvitation,reviewFamilyInvitation} from '../../domains/family/invitations';
import {grantFamilyBilling,authorizeFamilyBilling,listFamilyBilling,listSchoolBillingContacts,revokeFamilyBilling} from '../../domains/family-billing/service';
import {withdrawFamilyConnection} from '../../domains/family/connections';
test('family billing requires explicit current school authority, never leaks other families and fails after any scoped revocation',{skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL}),school=randomUUID(),people=Array.from({length:5},()=>randomUUID());const [principal,admin,parent,outsider,child]=people;let grantId='';
 try{
  for(const p of people)await pool.query('INSERT INTO identity.persons(id) VALUES($1)',[p]);await pool.query("INSERT INTO organisation.organisations(id,organisation_type,display_name) VALUES($1,'SCHOOL','Synthetic billing school')",[school]);
  for(const [person,role] of [[principal,'PRINCIPAL'],[admin,'SCHOOL_ADMINISTRATOR']]){await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'STAFF')",[person,school]);await pool.query('INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code=$3',[person,school,role]);}
  await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'LEARNER')",[child,school]);await pool.query("INSERT INTO organisation.learner_registrations(school_id,learner_person_id,admission_number,created_by) VALUES($1,$2,'SYN-BILLING-1',$3)",[school,child,admin]);
  const invitation=await createFamilyInvitation(pool,admin,school,{learnerPersonId:child,email:'billing@example.test',relationship:'PARENT'});await claimFamilyInvitation(pool,parent,'billing@example.test',{token:invitation.token,acknowledgement:true});await reviewFamilyInvitation(pool,principal,school,invitation.id,{decision:'CONFIRM',verifiedBySchool:true});
  assert.deepEqual((await listFamilyBilling(pool,parent)).scopes,[]);
  const contacts=await listSchoolBillingContacts(pool,principal,school);assert.equal(contacts.contacts.length,1);const relationshipId=contacts.contacts[0].relationshipId;
  const input={relationshipId,actions:['family.finance.read'],expiresAt:new Date(Date.now()+86400000).toISOString(),billingAuthorityChecked:true};
  await assert.rejects(grantFamilyBilling(pool,admin,school,input),/SCHOOL_PRINCIPAL_REQUIRED/);
  const results=await Promise.all([grantFamilyBilling(pool,principal,school,input),grantFamilyBilling(pool,principal,school,input)]);assert.equal(results[0].id,results[1].id);grantId=results[0].id;
  const allowed=await authorizeFamilyBilling(pool,parent,grantId,'family.finance.read');assert.equal(allowed?.schoolId,school);assert.equal(allowed?.learnerPersonId,child);assert.equal(allowed?.personId,parent);assert.equal(allowed?.contractVersion,'family-billing-v1');assert.ok(Date.parse(allowed!.expiresAt)<=Date.now()+31000);
  assert.equal(await authorizeFamilyBilling(pool,parent,grantId,'family.finance.proof.submit'),null);assert.equal(await authorizeFamilyBilling(pool,outsider,grantId,'family.finance.read'),null);assert.deepEqual((await listFamilyBilling(pool,outsider)).scopes,[]);assert.equal((await listFamilyBilling(pool,parent)).scopes.length,1);
  // Exercise the deployed restricted service role, not only the migration owner.
  // Existing host baseline permissions/policies are reproduced only in this CI DB.
  await pool.query('GRANT USAGE ON SCHEMA identity,organisation,access,audit TO peos_finance_test_runtime');
  await pool.query('GRANT SELECT ON identity.persons,identity.person_names,organisation.organisations,organisation.memberships,organisation.learner_registrations,organisation.family_invitations,identity.school_family_relationships,access.roles,access.role_assignments TO peos_finance_test_runtime');
  await pool.query('GRANT INSERT,UPDATE ON organisation.family_invitations,identity.school_family_relationships TO peos_finance_test_runtime');
  await pool.query('GRANT INSERT ON audit.events TO peos_finance_test_runtime');
  await pool.query('CREATE POLICY billing_ci_names_read ON identity.person_names FOR SELECT TO peos_finance_test_runtime USING(true)');
  await pool.query('CREATE POLICY billing_ci_learners_read ON organisation.learner_registrations FOR SELECT TO peos_finance_test_runtime USING(true)');
  const runtime=await pool.connect();try{
   await runtime.query('SET ROLE peos_finance_test_runtime');
   const restricted={connect:async()=>({query:(sql:string,args?:unknown[])=>runtime.query(sql,args),release:()=>{}})} as unknown as Pool;
   assert.equal((await listFamilyBilling(restricted,parent)).scopes.length,1);
   assert.deepEqual((await listFamilyBilling(restricted,outsider)).scopes,[]);
   const runtimeInvitation=await createFamilyInvitation(restricted,principal,school,{learnerPersonId:child,email:'runtime@example.test',relationship:'PARENT'});
   await claimFamilyInvitation(restricted,outsider,'runtime@example.test',{token:runtimeInvitation.token,acknowledgement:true});
   await reviewFamilyInvitation(restricted,principal,school,runtimeInvitation.id,{decision:'CONFIRM',verifiedBySchool:true});
   assert.equal((await listSchoolBillingContacts(restricted,principal,school)).contacts.length,2);
   assert.deepEqual((await listFamilyBilling(restricted,outsider)).scopes,[]);
   await withdrawFamilyConnection(restricted,outsider,runtimeInvitation.id,{acknowledgement:true});
   assert.equal((await listSchoolBillingContacts(restricted,principal,school)).contacts.length,1);
   assert.equal((await authorizeFamilyBilling(restricted,parent,grantId,'family.finance.read'))?.learnerPersonId,child);
   assert.equal(await authorizeFamilyBilling(restricted,outsider,grantId,'family.finance.read'),null);
   await assert.rejects(revokeFamilyBilling(restricted,outsider,grantId),/BILLING_CONTACT_UNAVAILABLE/);
   await revokeFamilyBilling(restricted,parent,grantId);assert.deepEqual((await listFamilyBilling(restricted,parent)).scopes,[]);
   grantId=(await grantFamilyBilling(restricted,principal,school,input)).id;
   assert.equal((await listFamilyBilling(restricted,parent)).scopes.length,1);
   assert.deepEqual((await runtime.query("SELECT has_table_privilege(current_user,'access.family_billing_grants','DELETE') AS deletion,(SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user) AS bypass")).rows[0],{deletion:false,bypass:false});
   await assert.rejects(runtime.query('DELETE FROM access.family_billing_grants WHERE id=$1',[grantId]),/permission denied/);
  }finally{await runtime.query('RESET ROLE');runtime.release();}
  for(const [sql,reset] of [
   ["UPDATE access.family_billing_grants SET expires_at=now()-interval '1 second',granted_at=now()-interval '2 days' WHERE id=$1","UPDATE access.family_billing_grants SET expires_at=now()+interval '1 day' WHERE id=$1"],
   ["UPDATE organisation.memberships SET status='ENDED' WHERE organisation_id=$1 AND person_id='"+child+"'","UPDATE organisation.memberships SET status='ACTIVE' WHERE organisation_id=$1 AND person_id='"+child+"'"],
   ["UPDATE access.role_assignments SET status='ENDED' WHERE organisation_id=$1 AND person_id='"+principal+"'","UPDATE access.role_assignments SET status='ACTIVE' WHERE organisation_id=$1 AND person_id='"+principal+"'"]
  ]){const key=sql.includes('family_billing_grants')?grantId:school;await pool.query(sql,[key]);assert.equal(await authorizeFamilyBilling(pool,parent,grantId,'family.finance.read'),null);assert.deepEqual((await listFamilyBilling(pool,parent)).scopes,[]);await pool.query(reset,[key]);}
  for(const [sql,reset,key] of [
   ["UPDATE identity.persons SET status='INACTIVE' WHERE id=$1","UPDATE identity.persons SET status='ACTIVE' WHERE id=$1",parent],
   ["UPDATE identity.persons SET status='INACTIVE' WHERE id=$1","UPDATE identity.persons SET status='ACTIVE' WHERE id=$1",child],
   ["UPDATE organisation.organisations SET status='INACTIVE' WHERE id=$1","UPDATE organisation.organisations SET status='ACTIVE' WHERE id=$1",school],
   ["UPDATE organisation.learner_registrations SET status='INACTIVE' WHERE school_id=$1","UPDATE organisation.learner_registrations SET status='ACTIVE' WHERE school_id=$1",school]
  ]){await pool.query(sql,[key]);assert.equal(await authorizeFamilyBilling(pool,parent,grantId,'family.finance.read'),null);await pool.query(reset,[key]);}
  await assert.rejects(grantFamilyBilling(pool,principal,randomUUID(),input),/SCHOOL_ADMIN_REQUIRED/);
  await assert.rejects(revokeFamilyBilling(pool,outsider,grantId),/BILLING_CONTACT_UNAVAILABLE/);
  await withdrawFamilyConnection(pool,parent,invitation.id,{acknowledgement:true});assert.equal(await authorizeFamilyBilling(pool,parent,grantId,'family.finance.read'),null);await revokeFamilyBilling(pool,parent,grantId);assert.equal((await pool.query('SELECT status FROM access.family_billing_grants WHERE id=$1',[grantId])).rows[0].status,'REVOKED');
  assert.equal((await pool.query('SELECT id FROM access.role_assignments WHERE person_id=$1',[parent])).rowCount,0);
  const audit=JSON.stringify((await pool.query("SELECT metadata,reason FROM audit.events WHERE action LIKE 'family.billing.%' AND actor_person_id=ANY($1::uuid[])",[people])).rows);assert.equal(audit.includes('billing@example.test'),false);assert.equal(audit.includes(invitation.token),false);
 }finally{await pool.query('DROP POLICY IF EXISTS billing_ci_names_read ON identity.person_names');await pool.query('DROP POLICY IF EXISTS billing_ci_learners_read ON organisation.learner_registrations');await pool.query('DELETE FROM access.family_billing_grants WHERE school_id=$1',[school]);await pool.query('DELETE FROM identity.school_family_relationships WHERE school_id=$1',[school]);await pool.query('DELETE FROM organisation.family_invitations WHERE school_id=$1',[school]);await pool.query('DELETE FROM organisation.learner_registrations WHERE school_id=$1',[school]);await pool.query('DELETE FROM access.role_assignments WHERE organisation_id=$1',[school]);await pool.query('DELETE FROM organisation.memberships WHERE organisation_id=$1',[school]);await pool.query('DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])',[people]);await pool.query('DELETE FROM organisation.organisations WHERE id=$1',[school]);await pool.query('DELETE FROM identity.persons WHERE id=ANY($1::uuid[])',[people]);await pool.end();}
});
