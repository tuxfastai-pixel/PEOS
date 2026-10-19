import assert from "node:assert/strict";
import test from "node:test";
import {learnerBatchSchema,rosterQuerySchema} from "../../domains/school-admin/learners";
test("enrolment accepts only bounded names and a school reference; no submitted identity or authority",()=>{
 const row={admissionNumber:" sc-001 ",givenName:"  Lea   Ana ",familyName:"Test"};
 assert.deepEqual(learnerBatchSchema.parse({learners:[row]}).learners[0],{admissionNumber:"SC-001",givenName:"Lea Ana",familyName:"Test"});
 for(const learners of [[],Array.from({length:51},(_,i)=>({...row,admissionNumber:`P${i}`})),[row,{...row,admissionNumber:"SC-001"}],[{...row,givenName:""}],[{...row,familyName:"name\ninjected"}],[{...row,admissionNumber:"=FORMULA"}],[{...row,personId:"guessed"}],[{...row,dateOfBirth:"2015-01-01"}]])assert.equal(learnerBatchSchema.safeParse({learners}).success,false);
 assert.deepEqual(rosterQuerySchema.parse({}),{offset:0});
 for(const value of [{offset:-1},{offset:"0 OR 1=1"},{schoolId:"other"}])assert.equal(rosterQuerySchema.safeParse(value).success,false);
});
