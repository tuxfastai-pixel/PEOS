import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import test from "node:test";
import {Pool} from "pg";
import {bulkInvitationSchema,createBulkInvitations} from "../../domains/school-admin/bulkInvitations";
import {acceptInvitation,createInvitation} from "../../domains/school-admin/service";

test("bulk invitations remain scoped, skip pending/current members and never elevate existing staff",{skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
  const pool=new Pool({connectionString:process.env.DATABASE_URL});const people:string[]=[];const schools:string[]=[];
  try{
    for(let i=0;i<3;i++)people.push((await pool.query("INSERT INTO identity.persons DEFAULT VALUES RETURNING id")).rows[0].id);
    for(let i=0;i<2;i++)schools.push((await pool.query("INSERT INTO organisation.organisations(organisation_type,display_name) VALUES ('SCHOOL',$1) RETURNING id",[`CI bulk ${randomUUID()}`])).rows[0].id);
    const [admin,teacher,outsider]=people;const [school,otherSchool]=schools;
    await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES ($1,$2,'STAFF'),($3,$4,'STAFF')",[admin,school,outsider,otherSchool]);
    await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT v.person,v.school,r.id FROM (VALUES ($1::uuid,$2::uuid),($3::uuid,$4::uuid)) v(person,school) CROSS JOIN access.roles r WHERE r.code='SCHOOL_ADMINISTRATOR'",[admin,school,outsider,otherSchool]);
    await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code='PRINCIPAL'",[admin,school]);
    const accepted=await createInvitation(pool,admin,school,{email:"member@example.test",roleCode:"TEACHER"});
    await acceptInvitation(pool,teacher,"member@example.test",accepted.token);
    await createInvitation(pool,admin,school,{email:"pending@example.test",roleCode:"TEACHER"});
    const input=bulkInvitationSchema.parse({recipients:[
      {email:"newteacher@example.test",roleCode:"TEACHER"},
      {email:"pending@example.test",roleCode:"SCHOOL_ADMINISTRATOR"},
      {email:"member@example.test",roleCode:"SCHOOL_ADMINISTRATOR"},
      {email:"newadmin@example.test",roleCode:"SCHOOL_ADMINISTRATOR"},
    ]});
    await assert.rejects(createBulkInvitations(pool,outsider,school,input),/SCHOOL_ADMIN_REQUIRED/);
    await assert.rejects(createBulkInvitations(pool,admin,otherSchool,input),/SCHOOL_ADMIN_REQUIRED/);
    const batch=await createBulkInvitations(pool,admin,school,input);
    assert.deepEqual(batch.delivery,{mode:"MANUAL",emailEnabled:false,status:"NOT_SENT"});
    assert.deepEqual(batch.results.map(r=>r.status),["CREATED","SKIPPED","SKIPPED","CREATED"]);
    assert.equal(batch.results[1].status==="SKIPPED"&&batch.results[1].reason,"INVITATION_ALREADY_PENDING");
    assert.equal(batch.results[2].status==="SKIPPED"&&batch.results[2].reason,"ALREADY_SCHOOL_MEMBER");
    for(const row of batch.results){
      if(row.status==="CREATED"){
        assert.equal(row.emailStatus,"NOT_SENT");assert.match(row.token,/^[A-Za-z0-9_-]{43}$/);
        const stored=await pool.query("SELECT token_hash,email,role_code FROM organisation.staff_invitations WHERE id=$1",[row.id]);
        assert.notEqual(stored.rows[0].token_hash,row.token);assert.equal(stored.rows[0].email,row.email);assert.equal(stored.rows[0].role_code,row.roleCode);
      }else assert.ok(!("token" in row));
    }
    const roles=await pool.query("SELECT r.code FROM access.role_assignments a JOIN access.roles r ON r.id=a.role_id WHERE a.person_id=$1 AND a.organisation_id=$2",[teacher,school]);
    assert.deepEqual(roles.rows.map(r=>r.code),["TEACHER"]);
    const retry=await createBulkInvitations(pool,admin,school,input);
    assert.equal(retry.results.every(r=>r.status==="SKIPPED"),true);
    const concurrentInput=bulkInvitationSchema.parse({recipients:[{email:"racing@example.test",roleCode:"TEACHER"}]});
    const concurrent=await Promise.all([createBulkInvitations(pool,admin,school,concurrentInput),createBulkInvitations(pool,admin,school,concurrentInput)]);
    assert.deepEqual(concurrent.map(r=>r.results[0].status).sort(),["CREATED","SKIPPED"]);
    const audit=await pool.query("SELECT * FROM audit.events WHERE actor_person_id=$1 AND action='school.invitation.bulk_recipient'",[admin]);
    assert.equal(audit.rowCount,7);
    assert.ok(!JSON.stringify(audit.rows).includes("@example.test"));
    for(const row of batch.results)if(row.status==="CREATED")assert.ok(!JSON.stringify(audit.rows).includes(row.token));
    await pool.query("UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1 AND organisation_id=$2",[admin,school]);
    await assert.rejects(createBulkInvitations(pool,admin,school,input),/SCHOOL_ADMIN_REQUIRED/);
  }finally{
    await pool.query("DELETE FROM organisation.staff_invitations WHERE school_id=ANY($1::uuid[])",[schools]);
    await pool.query("DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])",[people]);
    await pool.query("DELETE FROM organisation.memberships WHERE person_id=ANY($1::uuid[])",[people]);
    await pool.query("DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])",[people]);
    await pool.query("DELETE FROM organisation.organisations WHERE id=ANY($1::uuid[])",[schools]);
    await pool.query("DELETE FROM identity.persons WHERE id=ANY($1::uuid[])",[people]);
    await pool.end();
  }
});
