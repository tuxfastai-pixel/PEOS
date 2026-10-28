import { test } from "node:test";
import assert from "node:assert/strict";
import type { Pool } from "pg";
import { emptySchoolProfile, schoolProfileSchema, saveSchoolProfile } from "../../domains/school-admin/schoolProfile";

test("school profile accepts optional details and preserves leading zeroes", () => {
  const profile = schoolProfileSchema.parse({...emptySchoolProfile, phone:" 0123456789 ", emisNumber:" 001234 "});
  assert.equal(profile.phone, "0123456789");
  assert.equal(profile.emisNumber, "001234");
  assert.equal(schoolProfileSchema.safeParse({...profile,email:"not-an-email"}).success,false);
  assert.equal(schoolProfileSchema.safeParse({...profile, extra:"unexpected"}).success,false);
});

test("save checks school authority, prevents stale writes and does not audit contact data", async () => {
  const statements: {sql:string; values:unknown[]}[]=[];
  let authorized=true; let revision=0;
  const client = { query: async (sql:string, values:unknown[] = []) => {
    statements.push({sql,values});
    if(sql.includes("FOR SHARE OF")) return {rows: authorized ? [{id:"school-a"}] : [],rowCount:authorized?1:0};
    if(sql.includes("INSERT INTO organisation.school_profiles")) {
      if(values[11]===0 && revision===0) {revision=1;return {rows:[{...emptySchoolProfile,revision}],rowCount:1};}
      return {rows:[],rowCount:0};
    }
    if(sql.includes("UPDATE organisation.school_profiles SET")) return {rows:[],rowCount:0};
    return {rows:[],rowCount:0};
  }, release() {} };
  const pool={connect:async()=>client} as unknown as Pool;
  const profile={...emptySchoolProfile,email:"office@example.org"};
  await saveSchoolProfile(pool,"actor","school-a",profile);
  assert.ok(statements.some(x=>x.sql.includes("FOR SHARE OF") && x.values[1]==="school-a"));
  const audit=statements.find(x=>x.sql.includes("INSERT INTO audit.events"));
  assert.ok(audit); assert.equal(JSON.stringify(audit.values).includes(profile.email),false);
  await assert.rejects(saveSchoolProfile(pool,"actor","school-a",profile), /PROFILE_CONFLICT/);
  authorized=false;
  await assert.rejects(saveSchoolProfile(pool,"actor","school-b",profile), /SCHOOL_ADMIN_REQUIRED/);
});
