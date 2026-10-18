import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { Pool } from "pg";
import { provisionVerifiedIdentity } from "../../platform/auth/selfSignup";

// Only the isolated CI database is used; never use an arbitrary local production URL.
test("parallel first logins create one identity and grant no authority", { skip: !process.env.CI || !process.env.DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const provider = `https://test.invalid/${randomUUID()}`;
  try {
    const results = await Promise.all(Array.from({ length: 4 }, () => provisionVerifiedIdentity(pool, provider, "first-user")));
    assert.equal(new Set(results.map(row => row?.person_id)).size, 1);
    const result = await pool.query(`SELECT count(*)::int AS count FROM identity.credential_identities WHERE provider=$1`, [provider]);
    assert.equal(result.rows[0].count, 1);
    const personId = results[0]?.person_id;
    assert.ok(personId);
    const roles = await pool.query("SELECT count(*)::int AS count FROM access.role_assignments WHERE person_id=$1", [personId]);
    assert.equal(roles.rows[0].count, 0);
    await pool.query("UPDATE identity.accounts SET status='LOCKED' WHERE person_id=$1", [personId]);
    assert.equal(await provisionVerifiedIdentity(pool, provider, "first-user"), null);
  } finally {
    const rows = await pool.query(`SELECT a.id, a.person_id FROM identity.accounts a JOIN identity.credential_identities ci ON ci.account_id=a.id WHERE ci.provider=$1`, [provider]);
    for (const row of rows.rows) {
      await pool.query("DELETE FROM audit.events WHERE actor_person_id=$1", [row.person_id]);
      await pool.query("DELETE FROM identity.credential_identities WHERE account_id=$1", [row.id]);
      await pool.query("DELETE FROM identity.accounts WHERE id=$1", [row.id]);
      await pool.query("DELETE FROM identity.persons WHERE id=$1", [row.person_id]);
    }
    await pool.end();
  }
});
