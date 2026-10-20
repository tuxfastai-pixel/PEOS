import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {Pool} from "pg";
import {assertFounder,founderDirectory,founderSchool,supportContext} from "../../domains/founder/service";
test("global founder authority is distinct from school roles, revocable and exposes no learner records",{skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const people:string[]=[],schools:string[]=[];const classId=randomUUID();
 try{
 await pool.query("INSERT INTO access.roles(code,name) VALUES ('SPACECASE_FOUNDER','SpaceCase founder') ON CONFLICT(code) DO NOTHING");
 for(let i=0;i<3;i++)people.push((await pool.query("INSERT INTO identity.persons DEFAULT VALUES RETURNING id")).rows[0].id);
 for(const name of ["Zulu","Alpha"])schools.push((await pool.query("INSERT INTO organisation.organisations(organisation_type,display_name) VALUES ('SCHOOL',$1) RETURNING id",["CI founder "+name+" "+randomUUID()])).rows[0].id);
 const [founder,admin,outsider]=people;const [school]=schools;
 await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES ($1,$2,'STAFF')",[admin,school]);
 await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code='SCHOOL_ADMINISTRATOR'",[admin,school]);
 await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code='SPACECASE_FOUNDER'",[outsider,school]);
 await assert.rejects(assertFounder(pool,admin),/FOUNDER_REQUIRED/);await assert.rejects(assertFounder(pool,outsider),/FOUNDER_REQUIRED/);
 await pool.query("INSERT INTO access.role_assignments(person_id,role_id) SELECT $1,id FROM access.roles WHERE code='SPACECASE_FOUNDER'",[founder]);
 assert.equal((await supportContext(pool,founder)).founder,true);assert.equal((await supportContext(pool,admin)).founder,false);assert.equal((await supportContext(pool,admin)).schools.length,1);
 const list=await founderDirectory(pool,founder,"CI founder ",0);assert.equal(list.schools.length,2);assert.match(list.schools[0].displayName,/Alpha/);
 const profile=await founderSchool(pool,founder,school);assert.equal(profile.school.id,school);assert.equal("learners" in profile,false);assert.equal("email" in profile.school,false);
 await pool.query("INSERT INTO organisation.classes(id,school_id,name) VALUES($1,$2,'CI class')",[classId,school]);
 await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'STAFF')",[outsider,school]);
 await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code='TEACHER'",[outsider,school]);
 await pool.query("INSERT INTO organisation.teacher_assignments(teacher_person_id,school_id,class_id) VALUES($1,$2,$3)",[outsider,school,classId]);
 assert.equal((await founderSchool(pool,founder,school)).classes[0].assignedTeachers,1);
 await pool.query("UPDATE organisation.memberships SET status='ENDED' WHERE person_id=$1",[outsider]);
 assert.equal((await founderSchool(pool,founder,school)).classes[0].assignedTeachers,0);
 const contextAudit=await pool.query("SELECT id FROM audit.events WHERE actor_person_id=$1 AND action='support.context.read'",[founder]);assert.ok(contextAudit.rowCount);
 await pool.query("UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1",[founder]);
 await assert.rejects(founderDirectory(pool,founder,"",0),/FOUNDER_REQUIRED/);assert.equal((await supportContext(pool,founder)).founder,false);
 }finally{
 await pool.query("DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])",[people]);
 await pool.query("DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])",[people]);
 await pool.query("DELETE FROM organisation.memberships WHERE person_id=ANY($1::uuid[])",[people]);
 await pool.query("DELETE FROM organisation.teacher_assignments WHERE class_id=$1",[classId]);
 await pool.query("DELETE FROM organisation.classes WHERE id=$1",[classId]);
 await pool.query("DELETE FROM organisation.organisations WHERE id=ANY($1::uuid[])",[schools]);
 await pool.query("DELETE FROM identity.persons WHERE id=ANY($1::uuid[])",[people]);await pool.end();
 }
});
