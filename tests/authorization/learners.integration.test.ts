import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {Pool} from "pg";
import {assignClassTeacher,createSchoolClass,removeClassTeacher} from "../../domains/school-admin/classes";
import {classRoster,enrolLearners,learnerBatchSchema,removeClassLearner} from "../../domains/school-admin/learners";
import {getLearnerContext,teacherCanAccessLearner} from "../../domains/learner/context";
test("learner registration, import, roster and removal enforce current school and class authority",{skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const people:string[]=[];const schools:string[]=[];
 try{
  for(let i=0;i<4;i++)people.push((await pool.query("INSERT INTO identity.persons DEFAULT VALUES RETURNING id")).rows[0].id);
  for(let i=0;i<2;i++)schools.push((await pool.query("INSERT INTO organisation.organisations(organisation_type,display_name) VALUES ('SCHOOL',$1) RETURNING id",[`CI enrol ${randomUUID()}`])).rows[0].id);
  const [admin,teacher,outsider,unassigned]=people;const [school,other]=schools;
  for(const [p,s,role] of [[admin,school,"SCHOOL_ADMINISTRATOR"],[teacher,school,"TEACHER"],[outsider,other,"SCHOOL_ADMINISTRATOR"],[unassigned,school,"TEACHER"]]){
   await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES ($1,$2,'STAFF')",[p,s]);
   await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code=$3",[p,s,role]);
  }
  const c=await createSchoolClass(pool,admin,school,{name:"2A",academicYear:2026});
  const c2=await createSchoolClass(pool,admin,school,{name:"2B",academicYear:2026});
  const oc=await createSchoolClass(pool,outsider,other,{name:"Other",academicYear:2026});
  await assignClassTeacher(pool,admin,school,c.id,teacher);
  const input=learnerBatchSchema.parse({learners:[{admissionNumber:"A001",givenName:"CI Lea",familyName:"Example"},{admissionNumber:"A002",givenName:"CI Sam",familyName:"Example"}]});
  await assert.rejects(enrolLearners(pool,teacher,school,c.id,input),/SCHOOL_ADMIN_REQUIRED/);
  await assert.rejects(enrolLearners(pool,outsider,school,c.id,input),/SCHOOL_ADMIN_REQUIRED/);
  await assert.rejects(enrolLearners(pool,admin,school,oc.id,input),/CLASS_UNAVAILABLE/);
  const first=await enrolLearners(pool,admin,school,c.id,input);
  assert.deepEqual(first.results.map(r=>r.status),["CREATED","CREATED"]);
  const ids=first.results.map(r=>r.personId!);people.push(...ids);
  assert.equal((await pool.query("SELECT count(*) FROM identity.accounts WHERE person_id=ANY($1::uuid[])",[ids])).rows[0].count,"0");
  assert.equal(await teacherCanAccessLearner(pool,teacher,ids[0],school),true);
  assert.deepEqual((await enrolLearners(pool,admin,school,c.id,input)).results.map(r=>r.status),["ALREADY_ENROLLED","ALREADY_ENROLLED"]);
  const changed=learnerBatchSchema.parse({learners:[{...input.learners[0],givenName:"Wrong name"}]});
  assert.equal((await enrolLearners(pool,admin,school,c.id,changed)).results[0].status,"CONFLICT");
  assert.equal((await pool.query("SELECT given_name FROM identity.person_names WHERE person_id=$1",[ids[0]])).rows[0].given_name,"CI Lea");
  assert.equal((await enrolLearners(pool,admin,school,c2.id,input)).results[0].status,"ENROLLED");
  assert.equal((await getLearnerContext(pool,ids[0],school,teacher))?.classId,c.id);
  await assert.rejects(classRoster(pool,unassigned,school,c.id,0,"teacher"),/CLASS_TEACHER_REQUIRED/);
  await assert.rejects(classRoster(pool,teacher,school,c2.id,0,"teacher"),/CLASS_TEACHER_REQUIRED/);
  await assert.rejects(classRoster(pool,outsider,school,c.id),/SCHOOL_ADMIN_REQUIRED/);
  const roster=await classRoster(pool,teacher,school,c.id,0,"teacher");assert.equal(roster.learners.length,2);assert.equal(roster.nextOffset,null);
  assert.deepEqual(roster.learners.map(r=>r.givenName),["CI Lea","CI Sam"]);
  const race=learnerBatchSchema.parse({learners:[{admissionNumber:"RACE",givenName:"CI Race",familyName:"Example"}]});
  const batches=await Promise.all([enrolLearners(pool,admin,school,c.id,race),enrolLearners(pool,admin,school,c.id,race)]);
  assert.deepEqual(batches.map(b=>b.results[0].status).sort(),["ALREADY_ENROLLED","CREATED"]);people.push(batches[0].results[0].personId!);
  await removeClassLearner(pool,admin,school,c.id,ids[0]);assert.equal(await teacherCanAccessLearner(pool,teacher,ids[0],school),false);
  assert.equal((await classRoster(pool,admin,school,c.id)).learners.length,2);
  assert.equal((await enrolLearners(pool,admin,school,c.id,{learners:[input.learners[0]]})).results[0].status,"ENROLLED");
  await pool.query("UPDATE organisation.memberships SET status='ENDED' WHERE person_id=$1 AND membership_type='LEARNER'",[ids[0]]);
  assert.equal(await teacherCanAccessLearner(pool,teacher,ids[0],school),false);
  assert.equal((await enrolLearners(pool,admin,school,c.id,{learners:[input.learners[0]]})).results[0].status,"CONFLICT");
  for(let start=0;start<101;start+=50){
   const learners=Array.from({length:Math.min(50,101-start)},(_,i)=>({admissionNumber:`PAGE${start+i}`,givenName:`CI Page ${start+i}`,familyName:"ZExample"}));
   await enrolLearners(pool,admin,school,c.id,{learners});
  }
  const page=await classRoster(pool,admin,school,c.id);assert.equal(page.learners.length,100);assert.equal(page.nextOffset,100);
  const page2=await classRoster(pool,admin,school,c.id,100);assert.equal(page2.learners.length,3);assert.equal(page2.nextOffset,null);
  assert.equal(new Set([...page.learners,...page2.learners].map(r=>r.personId)).size,103);
  await removeClassTeacher(pool,admin,school,c.id,teacher);
  await assert.rejects(classRoster(pool,teacher,school,c.id,0,"teacher"),/CLASS_TEACHER_REQUIRED/);
  await assignClassTeacher(pool,admin,school,c.id,teacher);
  await pool.query("UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1",[teacher]);
  await assert.rejects(classRoster(pool,teacher,school,c.id,0,"teacher"),/CLASS_TEACHER_REQUIRED/);
  assert.equal(await teacherCanAccessLearner(pool,teacher,ids[1],school),false);
  const audit=await pool.query("SELECT metadata,reason FROM audit.events WHERE actor_person_id=$1 AND action='school.learner.enrol'",[admin]);
  assert.ok(audit.rows.length>0);assert.ok(!JSON.stringify(audit.rows).includes("CI Lea"));assert.ok(!JSON.stringify(audit.rows).includes("A001"));
 }finally{
  const registrations=await pool.query("SELECT learner_person_id AS id FROM organisation.learner_registrations WHERE school_id=ANY($1::uuid[])",[schools]);
  const all=[...new Set([...people,...registrations.rows.map(r=>r.id)])];
  await pool.query("DELETE FROM organisation.class_memberships WHERE learner_person_id=ANY($1::uuid[])",[all]);
  await pool.query("DELETE FROM organisation.learner_registrations WHERE school_id=ANY($1::uuid[])",[schools]);
  await pool.query("DELETE FROM identity.person_names WHERE person_id=ANY($1::uuid[])",[all]);
  await pool.query("DELETE FROM organisation.teacher_assignments WHERE school_id=ANY($1::uuid[])",[schools]);
  await pool.query("DELETE FROM organisation.classes WHERE school_id=ANY($1::uuid[])",[schools]);
  await pool.query("DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])",[all]);
  await pool.query("DELETE FROM organisation.memberships WHERE person_id=ANY($1::uuid[])",[all]);
  await pool.query("DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])",[all]);
  await pool.query("DELETE FROM organisation.organisations WHERE id=ANY($1::uuid[])",[schools]);
  await pool.query("DELETE FROM identity.persons WHERE id=ANY($1::uuid[])",[all]);await pool.end();
 }
});
