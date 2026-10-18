import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { provisionVerifiedIdentity } from "../../platform/auth/selfSignup";
import { exchangeExternalIdentity } from "../../platform/auth/sessionExchange";

function database(existing: unknown[] = [], failAudit = false) {
  const calls: string[] = [];
  const client = {
    async query(sql: string) {
      calls.push(sql);
      if (sql.includes("FROM identity.credential_identities")) return { rows: existing };
      if (sql.includes("INSERT INTO identity.persons")) return { rows: [{ id: "person" }] };
      if (sql.includes("INSERT INTO identity.accounts")) return { rows: [{ id: "account" }] };
      if (sql.includes("INSERT INTO audit.events") && failAudit) throw new Error("audit unavailable");
      return { rows: [] };
    },
    release() { calls.push("RELEASE"); },
  };
  return { pool: { connect: async () => client } as unknown as Pool, calls };
}

test("first signup creates only identity records and audit in a locked transaction", async () => {
  const { pool, calls } = database();
  assert.deepEqual(await provisionVerifiedIdentity(pool, "issuer", "subject"), { person_id: "person", account_id: "account" });
  assert.equal(calls[0], "BEGIN");
  assert.match(calls[1], /pg_advisory_xact_lock/);
  assert.equal(calls.at(-2), "COMMIT");
  assert.equal(calls.at(-1), "RELEASE");
  const writes = calls.filter(sql => /INSERT|UPDATE|DELETE/.test(sql));
  assert.equal(writes.length, 4);
  assert.ok(writes.every(sql => /identity\.(persons|accounts|credential_identities)|audit\.events/.test(sql)));
});

test("a concurrent/repeated signup reuses the existing active identity", async () => {
  const row = { account_id: "existing", person_id: "existing-person", account_status: "ACTIVE", person_status: "ACTIVE" };
  const { pool, calls } = database([row]);
  assert.deepEqual(await provisionVerifiedIdentity(pool, "issuer", "subject"), row);
  assert.ok(!calls.some(sql => sql.includes("INSERT")));
});

for (const [account_status, person_status] of [["LOCKED", "ACTIVE"], ["ACTIVE", "INACTIVE"], ["DISABLED", "ACTIVE"]]) {
  test(`signup cannot bypass ${account_status}/${person_status} identity`, async () => {
    const { pool, calls } = database([{ account_id: "existing", person_id: "person", account_status, person_status }]);
    assert.equal(await provisionVerifiedIdentity(pool, "issuer", "subject"), null);
    assert.ok(!calls.some(sql => sql.includes("INSERT")));
  });
}

test("audit failure rolls back identity creation and releases the connection", async () => {
  const { pool, calls } = database([], true);
  await assert.rejects(provisionVerifiedIdentity(pool, "issuer", "subject"), /audit unavailable/);
  assert.equal(calls.at(-2), "ROLLBACK");
  assert.ok(!calls.includes("COMMIT"));
  assert.equal(calls.at(-1), "RELEASE");
});

test("anonymous or missing signed signup eligibility never opens a provisioning connection", async () => {
  let connected = false;
  const pool = {
    query: async () => ({ rows: [] }),
    connect: async () => { connected = true; throw new Error("must not provision"); },
  } as unknown as Pool;
  for (const selfSignupAllowed of [undefined, false]) {
    const verifier = { verify: async () => ({ provider: "issuer", subject: "subject", selfSignupAllowed }) };
    assert.equal(await exchangeExternalIdentity(pool, verifier, "token", "peos", 3600, new Date(), true), null);
  }
  assert.equal(connected, false);
});

test("failed signature verification does not touch the database", async () => {
  const pool = { query: async () => { throw new Error("database must not be called"); } } as unknown as Pool;
  await assert.rejects(exchangeExternalIdentity(pool, { verify: async () => { throw new Error("JWT invalid"); } }, "bad", "peos", 3600, new Date(), true), /JWT invalid/);
});
