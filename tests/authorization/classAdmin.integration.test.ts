import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { assignClassTeacher,classDirectory,classInputSchema,createSchoolClass,removeClassTeacher,teacherAssignmentSchema } from "../../domains/school-admin/classes";
import { getTeacherContext } from "../../domains/teacher/context";
import { teacherCanAccessLearner } from "../../domains/learner/context";

test("class input rejects authority fields and malformed assignments",()=>{
  assert.deepEqual(classInputSchema.parse({name:"  Grade  2C ",academicYear:2026}),{name:"Grade 2C",academicYear:2026});
  assert.equal(classInputSchema.safeParse({name:"",academicYear:2026}).success,false);
  assert.equal(classInputSchema.safeParse({name:"Class",academicYear:2026,schoolId:randomUUID()}).success,false);
  assert.equal(classInputSchema.safeParse({name:"Class\nInjected",academicYear:2026}).success,false);
  assert.equal(teacherAssignmentSchema.safeParse({teacherPersonId:randomUUID(),roleCode:"SCHOOL_ADMINISTRATOR"}).success,false);
});

test("class assignment is scoped, current, idempotent and immediately revocable",{skip:!process.env.CI||!process.env.DATABASE_URL},async()=>{
  const pool=new Pool({connectionString:process.env.DATABASE_URL});const people:string[]=[];const schools:string[]=[];
  try{
    for(let i=0;i<4;i++)people.push((await pool.query("INSERT INTO identity.persons DEFAULT VALUES RETURNING id")).rows[0].id);
    for(let i=0;i<2;i++)schools.push((await pool.query("INSERT INTO organisation.organisations(organisation_type,display_name) VALUES ('SCHOOL',$1) RETURNING id",[`CI ${randomUUID()}`])).rows[0].id);
    const [admin,teacher,outsider,learner]=people;const [school,other]=schools;
    for(const [p,s,role] of [[admin,school,"SCHOOL_ADMINISTRATOR"],[teacher,school,"TEACHER"],[outsider,other,"SCHOOL_ADMINISTRATOR"]]){
      await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES ($1,$2,'STAFF')",[p,s]);
      await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code=$3",[p,s,role]);
    }
    const input={name:"Grade 2C",academicYear:2026};
    await assert.rejects(createSchoolClass(pool,teacher,school,input),/SCHOOL_ADMIN_REQUIRED/);
    await assert.rejects(classDirectory(pool,outsider,school),/SCHOOL_ADMIN_REQUIRED/);
    const classroom=await createSchoolClass(pool,admin,school,input);
    await assert.rejects(createSchoolClass(pool,admin,school,{...input,name:"grade 2c"}),/CLASS_ALREADY_EXISTS/);
    await createSchoolClass(pool,admin,school,{...input,academicYear:2027});
    const parallel=await Promise.allSettled([1,2].map(()=>createSchoolClass(pool,admin,school,{name:"Parallel",academicYear:2026})));
    assert.equal(parallel.filter(r=>r.status==="fulfilled").length,1);
    const otherClass=await createSchoolClass(pool,outsider,other,input);
    await assert.rejects(assignClassTeacher(pool,admin,school,otherClass.id,teacher),/CLASS_UNAVAILABLE/);
    await assert.rejects(assignClassTeacher(pool,outsider,other,classroom.id,teacher),/CLASS_UNAVAILABLE/);
    await assert.rejects(assignClassTeacher(pool,admin,school,classroom.id,outsider),/ACTIVE_SCHOOL_TEACHER_REQUIRED/);
    await assert.rejects(assignClassTeacher(pool,admin,school,classroom.id,admin),/ACTIVE_SCHOOL_TEACHER_REQUIRED/);
    await pool.query("UPDATE organisation.memberships SET starts_at=now()+interval '1 day' WHERE person_id=$1",[teacher]);
    await assert.rejects(assignClassTeacher(pool,admin,school,classroom.id,teacher),/ACTIVE_SCHOOL_TEACHER_REQUIRED/);
    await pool.query("UPDATE organisation.memberships SET starts_at=now()-interval '1 minute' WHERE person_id=$1",[teacher]);
    // Force a waiter whose transaction starts before the winning assignment is inserted.
    // Its stale transaction timestamp must not cause a duplicate after the lock releases.
    const locker=await pool.connect();
    try{
      await locker.query("BEGIN");
      await locker.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[JSON.stringify(["assignment",school,classroom.id,teacher]).toLowerCase()]);
      let signal!:()=>void;const reached=new Promise<void>(resolve=>{signal=resolve;});
      const waitingPool={connect:async()=>{const waiting=await pool.connect();return {
        query:(sql:string,values?:unknown[])=>{if(sql.includes("pg_advisory_xact_lock"))signal();return waiting.query(sql,values);},
        release:()=>waiting.release(),
      };}} as unknown as Pool;
      const attempt=assignClassTeacher(waitingPool,admin,school,classroom.id,teacher);
      await Promise.race([reached,attempt.then(()=>{throw new Error("Expected assignment to wait for lock");})]);
      await locker.query("INSERT INTO organisation.teacher_assignments(school_id,class_id,teacher_person_id,starts_at) VALUES ($1,$2,$3,clock_timestamp())",[school,classroom.id,teacher]);
      await locker.query("COMMIT");await attempt;
    }finally{await locker.query("ROLLBACK");locker.release();}
    await Promise.all([1,2].map(()=>assignClassTeacher(pool,admin,school,classroom.id,teacher)));
    const count=await pool.query("SELECT count(*) FROM organisation.teacher_assignments WHERE teacher_person_id=$1 AND status='ACTIVE'",[teacher]);
    assert.equal(count.rows[0].count,"1");
    const context=await getTeacherContext(pool,teacher);assert.deepEqual(context?.classIds,[classroom.id]);
    assert.deepEqual(context?.classes,[{id:classroom.id,name:"Grade 2C",academicYear:2026}]);
    await pool.query("INSERT INTO organisation.teacher_assignments(school_id,class_id,teacher_person_id) VALUES ($1,$2,$3)",[school,otherClass.id,teacher]);
    assert.deepEqual((await getTeacherContext(pool,teacher))?.classIds,[classroom.id]);
    const directory=await classDirectory(pool,admin,school);assert.equal(directory.teachers.length,1);assert.equal(directory.assignments.length,1);
    await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES ($1,$2,'LEARNER')",[learner,school]);
    await pool.query("INSERT INTO organisation.class_memberships(class_id,learner_person_id) VALUES ($1,$2)",[classroom.id,learner]);
    assert.equal(await teacherCanAccessLearner(pool,teacher,learner,school),true);
    await assert.rejects(removeClassTeacher(pool,outsider,other,classroom.id,teacher),/ASSIGNMENT_UNAVAILABLE/);
    await removeClassTeacher(pool,admin,school,classroom.id,teacher);
    assert.equal(await teacherCanAccessLearner(pool,teacher,learner,school),false);
    assert.deepEqual((await getTeacherContext(pool,teacher))?.classIds,[]);
    await assignClassTeacher(pool,admin,school,classroom.id,teacher);
    await pool.query("UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1",[teacher]);
    assert.equal(await getTeacherContext(pool,teacher),null);
    assert.equal((await classDirectory(pool,admin,school)).teachers.length,0);
    const audit=await pool.query("SELECT action FROM audit.events WHERE actor_person_id=$1 AND action LIKE 'school.class.%'",[admin]);
    assert.ok(audit.rows.some(r=>r.action==="school.class.remove_teacher"));
  }finally{
    await pool.query("DELETE FROM organisation.class_memberships WHERE learner_person_id=ANY($1::uuid[])",[people]);
    await pool.query("DELETE FROM organisation.teacher_assignments WHERE school_id=ANY($1::uuid[])",[schools]);
    await pool.query("DELETE FROM organisation.classes WHERE school_id=ANY($1::uuid[])",[schools]);
    await pool.query("DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])",[people]);
    await pool.query("DELETE FROM organisation.memberships WHERE person_id=ANY($1::uuid[])",[people]);
    await pool.query("DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])",[people]);
    await pool.query("DELETE FROM organisation.organisations WHERE id=ANY($1::uuid[])",[schools]);
    await pool.query("DELETE FROM identity.persons WHERE id=ANY($1::uuid[])",[people]);await pool.end();
  }
});
