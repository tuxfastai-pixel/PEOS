import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { acceptInvitation, assertSchoolAdmin, createInvitation, listAdminSchools, previewInvitation, renameSchool, revokeInvitation } from "../../domains/school-admin/service";

test("school administration and invitations remain scoped, email-bound and revocable", { skip: !process.env.CI || !process.env.DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const people: string[] = [];
  const schools: string[] = [];
  try {
    for (let i = 0; i < 3; i++) people.push((await pool.query("INSERT INTO identity.persons DEFAULT VALUES RETURNING id")).rows[0].id);
    for (let i = 0; i < 2; i++) schools.push((await pool.query("INSERT INTO organisation.organisations(organisation_type,display_name) VALUES ('SCHOOL',$1) RETURNING id", [`CI school ${randomUUID()}`])).rows[0].id);
    const [admin, recipient, outsider] = people;
    const [school, otherSchool] = schools;
    await pool.query("INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES ($1,$2,'STAFF'),($3,$4,'STAFF')", [admin, school, outsider, otherSchool]);
    await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code='SCHOOL_ADMINISTRATOR'", [admin, school]);
    await pool.query("INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code='SCHOOL_ADMINISTRATOR'", [outsider, otherSchool]);
    assert.equal((await listAdminSchools(pool, admin)).length, 1);
    await assert.rejects(assertSchoolAdmin(pool, recipient, school), /SCHOOL_ADMIN_REQUIRED/);
    await assert.rejects(renameSchool(pool, outsider, school, "Unauthorized rename"), /SCHOOL_ADMIN_REQUIRED/);
    assert.equal((await renameSchool(pool, admin, school, "Renamed pilot")).displayName, "Renamed pilot");
    const input = { email: "pilot@example.test", roleCode: "TEACHER" as const };
    const created = await createInvitation(pool, admin, school, input);
    const stored = await pool.query("SELECT token_hash FROM organisation.staff_invitations WHERE id=$1", [created.id]);
    assert.notEqual(stored.rows[0].token_hash, created.token);
    assert.deepEqual(await previewInvitation(pool, created.token), { schoolName: "Renamed pilot", roleCode: "TEACHER" });
    await assert.rejects(createInvitation(pool, admin, school, input), /INVITATION_ALREADY_PENDING/);
    await assert.rejects(acceptInvitation(pool, recipient, "wrong@example.test", created.token), /INVITED_EMAIL_REQUIRED/);
    const accepted = await acceptInvitation(pool, recipient, input.email, created.token);
    assert.equal(accepted.schoolId, school);
    await assert.rejects(acceptInvitation(pool, recipient, input.email, created.token), /INVITATION_UNAVAILABLE/);
    await assert.rejects(assertSchoolAdmin(pool, recipient, school), /SCHOOL_ADMIN_REQUIRED/);
    const classes = await pool.query("SELECT id FROM organisation.teacher_assignments WHERE teacher_person_id=$1", [recipient]);
    assert.equal(classes.rowCount, 0);
    const revoked = await createInvitation(pool, admin, school, { ...input, email: "revoked@example.test" });
    await revokeInvitation(pool, admin, school, revoked.id);
    await assert.rejects(acceptInvitation(pool, recipient, "revoked@example.test", revoked.token), /INVITATION_UNAVAILABLE/);
    const expired = await createInvitation(pool, admin, school, { ...input, email: "expired@example.test" });
    await pool.query("UPDATE organisation.staff_invitations SET created_at=now()-interval '8 days',expires_at=now()-interval '1 second' WHERE id=$1", [expired.id]);
    await assert.rejects(acceptInvitation(pool, recipient, "expired@example.test", expired.token), /INVITATION_UNAVAILABLE/);
    const concurrent = await Promise.allSettled([1,2].map(() => createInvitation(pool, admin, school, { ...input, email: "parallel@example.test" })));
    assert.equal(concurrent.filter(result => result.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter(result => result.status === "rejected").length, 1);
    const revokedAdmin = await createInvitation(pool, admin, school, { ...input, email: "revoked-admin@example.test" });
    await pool.query("UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1 AND organisation_id=$2", [admin, school]);
    await assert.rejects(acceptInvitation(pool, recipient, "revoked-admin@example.test", revokedAdmin.token), /SCHOOL_ADMIN_REQUIRED/);
  } finally {
    await pool.query("DELETE FROM organisation.staff_invitations WHERE school_id=ANY($1::uuid[])", [schools]);
    await pool.query("DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])", [people]);
    await pool.query("DELETE FROM organisation.memberships WHERE person_id=ANY($1::uuid[])", [people]);
    await pool.query("DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])", [people]);
    await pool.query("DELETE FROM organisation.organisations WHERE id=ANY($1::uuid[])", [schools]);
    await pool.query("DELETE FROM identity.persons WHERE id=ANY($1::uuid[])", [people]);
    await pool.end();
  }
});
