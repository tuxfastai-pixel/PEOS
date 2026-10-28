import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {Pool} from 'pg';
import {acceptInvitation,assertSchoolPrincipal,createInvitation,previewInvitation,replaceInvitationLink} from '../../domains/school-admin/service';import {createBulkInvitations} from '../../domains/school-admin/bulkInvitations';
test('only a current school principal can appoint administrators and demotion invalidates pending grants',{skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const people=[randomUUID(),randomUUID(),randomUUID()],school=randomUUID();const [principal,admin,recipient]=people;
 try{
  for(const id of people)await pool.query('INSERT INTO identity.persons(id) VALUES($1)',[id]);
  await pool.query("INSERT INTO organisation.organisations(id,organisation_type,display_name) VALUES($1,'SCHOOL','CI principal authority')",[school]);
  for(const id of [principal,admin]){
   await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'STAFF')",[id,school]);
   await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code='SCHOOL_ADMINISTRATOR'",[id,school]);
  }
  await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code='PRINCIPAL'",[principal,school]);
  const input={email:'new-admin@example.test',roleCode:'SCHOOL_ADMINISTRATOR' as const};
  await assert.rejects(assertSchoolPrincipal(pool,admin,school),/SCHOOL_PRINCIPAL_REQUIRED/);
  await assert.rejects(createInvitation(pool,admin,school,input),/SCHOOL_PRINCIPAL_REQUIRED/);
  const batch=await createBulkInvitations(pool,admin,school,{recipients:[{email:'teacher@example.test',roleCode:'TEACHER'},input]});assert.equal(batch.results[0].status,'CREATED');assert.equal(batch.results[1].status,'FAILED');assert.equal(batch.results[1].status==='FAILED'&&batch.results[1].reason,'SCHOOL_PRINCIPAL_REQUIRED');
  const invite=await createInvitation(pool,principal,school,input);
  await assert.rejects(replaceInvitationLink(pool,admin,school,invite.id),/SCHOOL_PRINCIPAL_REQUIRED/);
  const replacement=await replaceInvitationLink(pool,principal,school,invite.id);
  await pool.query("UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1 AND role_id=(SELECT id FROM access.roles WHERE code='PRINCIPAL')",[principal]);
  await assert.rejects(previewInvitation(pool,replacement.token),/SCHOOL_PRINCIPAL_REQUIRED/);
  await assert.rejects(acceptInvitation(pool,recipient,input.email,replacement.token),/SCHOOL_PRINCIPAL_REQUIRED/);
  assert.equal((await pool.query('SELECT id FROM organisation.memberships WHERE person_id=$1',[recipient])).rowCount,0);
  await pool.query("UPDATE access.role_assignments SET status='ACTIVE' WHERE person_id=$1 AND role_id=(SELECT id FROM access.roles WHERE code='PRINCIPAL')",[principal]);
  await acceptInvitation(pool,recipient,input.email,replacement.token);
  const roles=await pool.query('SELECT r.code FROM access.role_assignments ra JOIN access.roles r ON r.id=ra.role_id WHERE person_id=$1',[recipient]);assert.deepEqual(roles.rows.map(r=>r.code),['SCHOOL_ADMINISTRATOR']);
  await assert.rejects(assertSchoolPrincipal(pool,recipient,school),/SCHOOL_PRINCIPAL_REQUIRED/);
 }finally{
  await pool.query('DELETE FROM organisation.staff_invitations WHERE school_id=$1',[school]);await pool.query('DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])',[people]);await pool.query('DELETE FROM organisation.memberships WHERE organisation_id=$1',[school]);await pool.query('DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])',[people]);await pool.query('DELETE FROM organisation.organisations WHERE id=$1',[school]);await pool.query('DELETE FROM identity.persons WHERE id=ANY($1::uuid[])',[people]);await pool.end();
 }
});
