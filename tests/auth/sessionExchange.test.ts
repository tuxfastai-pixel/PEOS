import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";

import { exchangeExternalIdentity } from "../../platform/auth/sessionExchange";
import type { ExternalIdentityVerifier } from "../../platform/auth/oidcVerifier";

class FixedVerifier implements ExternalIdentityVerifier {
  async verify(): Promise<{ provider: string; subject: string }> {
    return { provider: "https://id.example.test", subject: "teacher-123" };
  }
}

test("verified provisioned identity receives one PEOS bearer session", async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const pool = {
    async query(text: string, values?: unknown[]) {
      calls.push({ text, values });
      if (text.includes("FROM identity.credential_identities")) {
        return { rows: [{ account_id: "account-1", person_id: "person-1" }] };
      }
      if (text.includes("INSERT INTO session.sessions")) {
        return { rows: [{ session_id: "session-1" }] };
      }
      if (text.includes("INSERT INTO audit.events")) {
        return { rows: [] };
      }
      throw new Error(`Unexpected query: ${text}`);
    },
  } as unknown as Pool;

  const now = new Date("2026-09-05T12:00:00.000Z");
  const result = await exchangeExternalIdentity(pool, new FixedVerifier(), "external-token", "peos", 3600, now);

  assert.ok(result);
  assert.equal(result.tokenType, "Bearer");
  assert.equal(result.session.sessionId, "session-1");
  assert.equal(result.session.personId, "person-1");
  assert.equal(result.session.issuedAt, "2026-09-05T12:00:00.000Z");
  assert.equal(result.session.expiresAt, "2026-09-05T13:00:00.000Z");
  assert.ok(result.accessToken.length >= 40);

  const insert = calls.find((call) => call.text.includes("INSERT INTO session.sessions"));
  assert.ok(insert);
  assert.notEqual(insert.values?.[1], result.accessToken, "raw bearer token must never be persisted");
});

test("verified but unprovisioned identity is denied and audited", async () => {
  const calls: string[] = [];
  const pool = {
    async query(text: string) {
      calls.push(text);
      if (text.includes("FROM identity.credential_identities")) return { rows: [] };
      if (text.includes("INSERT INTO audit.events")) return { rows: [] };
      throw new Error(`Unexpected query: ${text}`);
    },
  } as unknown as Pool;

  const result = await exchangeExternalIdentity(
    pool,
    new FixedVerifier(),
    "external-token",
    "peos",
    3600,
  );

  assert.equal(result, null);
  assert.ok(calls.some((text) => text.includes("INSERT INTO audit.events")));
  assert.ok(!calls.some((text) => text.includes("INSERT INTO session.sessions")));
});
