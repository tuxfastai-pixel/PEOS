import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Pool} from 'pg';
import {emptySchoolProfile,getSchoolProfile,saveSchoolProfile} from '../../domains/school-admin/schoolProfile';

test('school profiles persist, reject cross-school access, serialize edits and stop revoked administrators', {skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});
 const people=[randomUUID(),randomUUID()], schools=[randomUUID(),randomUUID()];
 const [admin,otherAdmin]=people, [school,otherSchool]=schools;
 try {
  for(const id of people)await pool.query('INSERT INTO identity.persons(id) VALUES($1)',[id]);
  for(const id of schools)await pool.query("INSERT INTO organisation.organisations(id,organisation_type,display_name) VALUES($1,'SCHOOL','CI profile school')",[id]);
  for(let i=0;i<2;i++){
   await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'STAFF')",[people[i],schools[i]]);
   await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code='SCHOOL_ADMINISTRATOR'",[people[i],schools[i]]);
  }
  assert.deepEqual(await getSchoolProfile(pool,admin,school),emptySchoolProfile);
  const input={...emptySchoolProfile,emisNumber:'001234',phone:'0123456789',email:'office@example.test'};
  await assert.rejects(saveSchoolProfile(pool,otherAdmin,school,input),/SCHOOL_ADMIN_REQUIRED/);
  await assert.rejects(getSchoolProfile(pool,otherAdmin,school),/SCHOOL_ADMIN_REQUIRED/);
  const creates=await Promise.allSettled([1,2].map(()=>saveSchoolProfile(pool,admin,school,input)));
  assert.equal(creates.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(creates.filter(r=>r.status==='rejected').length,1);
  const saved=await getSchoolProfile(pool,admin,school);
  assert.equal(saved.revision,1);assert.equal(saved.emisNumber,'001234');assert.equal(saved.phone,'0123456789');
  const edits=await Promise.allSettled(['A','B'].map(district=>saveSchoolProfile(pool,admin,school,{...saved,district})));
  assert.equal(edits.filter(r=>r.status==='fulfilled').length,1);
  assert.equal(edits.filter(r=>r.status==='rejected').length,1);
  const latest=await getSchoolProfile(pool,admin,school);
  const cleared=await saveSchoolProfile(pool,admin,school,{...emptySchoolProfile,revision:latest.revision});
  assert.equal(cleared.email,'');assert.equal(cleared.revision,3);
  assert.equal((await getSchoolProfile(pool,otherAdmin,otherSchool)).revision,0);
  const audit=JSON.stringify((await pool.query("SELECT metadata FROM audit.events WHERE resource_id=$1 AND action='school.profile.update'",[school])).rows);
  assert.equal(audit.includes(input.email),false);assert.equal(audit.includes(input.phone),false);
  await pool.query("UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1",[admin]);
  await assert.rejects(getSchoolProfile(pool,admin,school),/SCHOOL_ADMIN_REQUIRED/);
  await assert.rejects(saveSchoolProfile(pool,admin,school,cleared),/SCHOOL_ADMIN_REQUIRED/);
 }finally{
  await pool.query('DELETE FROM organisation.school_profiles WHERE school_id=ANY($1::uuid[])',[schools]);
  await pool.query('DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])',[people]);
  await pool.query('DELETE FROM organisation.memberships WHERE person_id=ANY($1::uuid[])',[people]);
  await pool.query('DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])',[people]);
  await pool.query('DELETE FROM organisation.organisations WHERE id=ANY($1::uuid[])',[schools]);
  await pool.query('DELETE FROM identity.persons WHERE id=ANY($1::uuid[])',[people]);await pool.end();
 }
});
