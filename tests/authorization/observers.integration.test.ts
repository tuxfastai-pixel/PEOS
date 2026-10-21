import assert from "node:assert/strict";
import test from "node:test";
import {randomUUID} from "node:crypto";
import {Pool} from "pg";
import {manageObservers} from "../../domains/founder/observers";
import {supportContext} from "../../domains/founder/service";
test("observer authority is founder-managed, school-scoped, membership-bound and revocable",{skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
 const pool=new Pool({connectionString:process.env.DATABASE_URL});const people=[randomUUID(),randomUUID(),randomUUID()];const schoolId=randomUUID();
 try{
 for(const person of people){await pool.query("INSERT INTO identity.persons(id) VALUES($1)",[person]);await pool.query("INSERT INTO identity.accounts(person_id) VALUES($1)",[person]);}
 await pool.query("INSERT INTO organisation.organisations(id,organisation_type,display_name) VALUES($1,'SCHOOL','CI observer school')",[schoolId]);
 await pool.query("INSERT INTO access.roles(code,name) VALUES('SPACECASE_FOUNDER','Founder') ON CONFLICT(code) DO NOTHING");
 await pool.query("INSERT INTO access.role_assignments(person_id,role_id) SELECT $1,id FROM access.roles WHERE code='SPACECASE_FOUNDER'",[people[0]]);
 const input={action:"GRANT" as const,personId:people[1],days:7,reason:"Assigned to school monitoring pilot"};
 await assert.rejects(manageObservers(pool,people[1],schoolId,input),/FOUNDER_REQUIRED/);
 await manageObservers(pool,people[0],schoolId,input);
 const c=await supportContext(pool,people[1]);assert.equal(c.founder,false);assert.equal(c.schools.length,0);assert.equal(c.agentSchools.length,0);assert.equal(c.observerSchools[0].id,schoolId);
 const agentGrant=await manageObservers(pool,people[0],schoolId,{...input,accessLevel:"AGENT"});assert.equal(agentGrant.agents.length,1);assert.equal((await supportContext(pool,people[1])).schools.length,0);assert.equal((await supportContext(pool,people[1])).agentSchools[0].id,schoolId);
 await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id,ends_at) SELECT $1,$2,r.id,now()+interval '1 day' FROM access.roles r CROSS JOIN generate_series(1,201) WHERE r.code='SPACECASE_SUPPORT_OBSERVER'",[people[1],schoolId]);
 const crowded=await manageObservers(pool,people[0],schoolId);assert.equal(crowded.agents.length,1);assert.equal(crowded.observers.length,200);assert.equal(crowded.truncated,true);
 await pool.query("UPDATE access.role_assignments ra SET status='ENDED' FROM access.roles r WHERE ra.role_id=r.id AND r.code='SPACECASE_SUPPORT_OBSERVER' AND ra.person_id=$1 AND ra.ends_at<now()+interval '2 days'",[people[1]]);
 await manageObservers(pool,people[0],schoolId,{action:"REVOKE",assignmentId:agentGrant.agents[0].id,reason:"Remove case handling but retain monitoring"});assert.equal((await supportContext(pool,people[1])).agentSchools.length,0);assert.equal((await supportContext(pool,people[1])).observerSchools.length,1);
 await pool.query("UPDATE organisation.memberships SET status='ENDED' WHERE person_id=$1 AND membership_type='SUPPORT_OPERATOR'",[people[1]]);assert.equal((await supportContext(pool,people[1])).observerSchools.length,0);
 const renewed=await manageObservers(pool,people[0],schoolId,input);assert.equal(renewed.observers.length,1);
 await manageObservers(pool,people[0],schoolId,{action:"REVOKE",assignmentId:renewed.observers[0].id,reason:"Pilot monitoring assignment ended"});assert.equal((await supportContext(pool,people[1])).observerSchools.length,0);
 await manageObservers(pool,people[0],schoolId,input);await pool.query("UPDATE access.role_assignments SET ends_at=now()-interval '1 minute' WHERE person_id=$1",[people[1]]);assert.equal((await supportContext(pool,people[1])).observerSchools.length,0);
 await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'LEARNER')",[people[2],schoolId]);await assert.rejects(manageObservers(pool,people[0],schoolId,{...input,personId:people[2]}),/OPERATOR_ACCOUNT_REQUIRED/);
 await pool.query("INSERT INTO access.role_assignments(person_id,role_id) SELECT $1,id FROM access.roles WHERE code='SPACECASE_SUPPORT_OBSERVER'",[people[2]]);assert.equal((await supportContext(pool,people[2])).observerSchools.length,0);
 await pool.query("INSERT INTO access.role_assignments(person_id,role_id) SELECT $1,id FROM access.roles WHERE code='SPACECASE_SUPPORT_AGENT'",[people[1]]);assert.equal((await supportContext(pool,people[1])).agentSchools.length,0);
 }finally{
 await pool.query("DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])",[people]);await pool.query("DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])",[people]);await pool.query("DELETE FROM organisation.memberships WHERE person_id=ANY($1::uuid[])",[people]);await pool.query("DELETE FROM identity.accounts WHERE person_id=ANY($1::uuid[])",[people]);await pool.query("DELETE FROM identity.persons WHERE id=ANY($1::uuid[])",[people]);await pool.query("DELETE FROM organisation.organisations WHERE id=$1",[schoolId]);await pool.end();
 }
});
