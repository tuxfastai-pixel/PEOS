import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";

import { getTeacherContext } from "../../domains/teacher/context";

const databaseUrl = process.env.DATABASE_URL;

test("teacher context ignores future membership and accepts only current school authority", { skip: !databaseUrl }, async () => {
  const pool = new Pool({ connectionString: databaseUrl });
  const client = await pool.connect();

  const personId = randomUUID();
  const schoolId = randomUUID();
  const classId = randomUUID();
  const membershipId = randomUUID();
  const roleAssignmentId = randomUUID();
  const teacherAssignmentId = randomUUID();

  try {
    await client.query("BEGIN");
    await client.query("INSERT INTO identity.persons(id) VALUES ($1)", [personId]);
    await client.query(
      "INSERT INTO organisation.organisations(id, organisation_type, display_name) VALUES ($1, 'SCHOOL', 'Authority Test School')",
      [schoolId],
    );
    await client.query(
      "INSERT INTO organisation.classes(id, school_id, name, status) VALUES ($1, $2, '4A', 'ACTIVE')",
      [classId, schoolId],
    );
    await client.query(
      `INSERT INTO organisation.memberships(id, person_id, organisation_id, membership_type, status, starts_at)
       VALUES ($1, $2, $3, 'STAFF', 'ACTIVE', now() + interval '1 day')`,
      [membershipId, personId, schoolId],
    );
    await client.query(
      `INSERT INTO access.role_assignments(id, person_id, role_id, organisation_id, status, starts_at)
       SELECT $1, $2, id, $3, 'ACTIVE', now() - interval '1 minute'
       FROM access.roles WHERE code = 'TEACHER'`,
      [roleAssignmentId, personId, schoolId],
    );
    await client.query(
      `INSERT INTO organisation.teacher_assignments(id, teacher_person_id, school_id, class_id, status, starts_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', now() - interval '1 minute')`,
      [teacherAssignmentId, personId, schoolId, classId],
    );

    const futureContext = await getTeacherContext(client as unknown as Pool, personId);
    assert.equal(futureContext, null);

    await client.query(
      "UPDATE organisation.memberships SET starts_at = now() - interval '1 minute' WHERE id = $1",
      [membershipId],
    );

    const currentContext = await getTeacherContext(client as unknown as Pool, personId);
    assert.ok(currentContext);
    assert.equal(currentContext.personId, personId);
    assert.equal(currentContext.schoolId, schoolId);
    assert.deepEqual(currentContext.classIds, [classId]);
    assert.equal(currentContext.active, true);
  } finally {
    await client.query("ROLLBACK");
    client.release();
    await pool.end();
  }
});
