import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {Pool} from 'pg';
import {financeLearnerPicker,resolveFinanceLearners} from '../../domains/school-finance/learnerPicker';
test('Finance picker: canonical class/search only, bounded literal matching and no cross-school or unassigned access',{skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL}),school=randomUUID(),other=randomUUID(),officer=randomUUID(),child=randomUUID(),outsider=randomUUID(),classId=randomUUID();
 try{
  for(const id of [officer,child,outsider])await pool.query('INSERT INTO identity.persons(id) VALUES($1)',[id]);
  for(const id of [school,other])await pool.query("INSERT INTO organisation.organisations(id,organisation_type,display_name) VALUES($1,'SCHOOL','Picker synthetic')",[id]);
  await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$3,'STAFF'),($2,$3,'LEARNER')",[officer,child,school]);
  await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code='FINANCE_OFFICER'",[officer,school]);
  await pool.query("INSERT INTO identity.person_names(person_id,given_name,family_name) VALUES($1,'Synthetic','Picker')",[child]);
  await pool.query("INSERT INTO organisation.learner_registrations(school_id,learner_person_id,admission_number,created_by) VALUES($1,$2,'PICK-1',$3)",[school,child,officer]);
  await pool.query("INSERT INTO organisation.classes(id,school_id,name,academic_year) VALUES($1,$2,'2C',2027)",[classId,school]);await pool.query('INSERT INTO organisation.class_memberships(class_id,learner_person_id) VALUES($1,$2)',[classId,child]);
  const empty=await financeLearnerPicker(pool,officer,school,{});assert.equal(empty.learners.length,0);assert.equal(empty.classes[0].id,classId);
  assert.equal((await financeLearnerPicker(pool,officer,school,{q:'picker'})).learners[0].personId,child);
  assert.equal((await financeLearnerPicker(pool,officer,school,{classId})).learners[0].admissionNumber,'PICK-1');
  assert.equal((await financeLearnerPicker(pool,officer,school,{q:'%'})).learners.length,0);
  assert.equal((await financeLearnerPicker(pool,officer,school,{classId:randomUUID()})).learners.length,0);
  await assert.rejects(financeLearnerPicker(pool,officer,other,{q:'Picker'}),/SCHOOL_FINANCE_FORBIDDEN/);await assert.rejects(financeLearnerPicker(pool,outsider,school,{q:'Picker'}),/SCHOOL_FINANCE_FORBIDDEN/);
  assert.equal((await resolveFinanceLearners(pool,officer,school,['pick-1'])).learners[0].personId,child);
  await assert.rejects(resolveFinanceLearners(pool,officer,school,['PICK-1','MISSING']),/SCHOOL_FINANCE_FORBIDDEN/);
  await pool.query("UPDATE organisation.class_memberships SET status='ENDED' WHERE class_id=$1",[classId]);assert.equal((await financeLearnerPicker(pool,officer,school,{classId})).learners.length,0);
  await pool.query("UPDATE organisation.memberships SET status='ENDED' WHERE person_id=$1",[child]);await assert.rejects(resolveFinanceLearners(pool,officer,school,['PICK-1']),/SCHOOL_FINANCE_FORBIDDEN/);
 }finally{
  await pool.query('DELETE FROM organisation.class_memberships WHERE class_id=$1',[classId]);await pool.query('DELETE FROM organisation.classes WHERE id=$1',[classId]);await pool.query('DELETE FROM organisation.learner_registrations WHERE school_id=$1',[school]);await pool.query('DELETE FROM identity.person_names WHERE person_id=$1',[child]);await pool.query('DELETE FROM access.role_assignments WHERE organisation_id=$1',[school]);await pool.query('DELETE FROM organisation.memberships WHERE organisation_id=$1',[school]);await pool.query('DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])',[[officer,outsider]]);await pool.query('DELETE FROM organisation.organisations WHERE id=ANY($1::uuid[])',[[school,other]]);await pool.query('DELETE FROM identity.persons WHERE id=ANY($1::uuid[])',[[officer,child,outsider]]);await pool.end();
 }
});
