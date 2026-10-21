import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";

import {
  hashBearerToken,
  introspectBearerSession,
  readBearerToken,
} from "../../platform/session/service";

test("bearer tokens are hashed deterministically without storing plaintext", () => {
  const hash = hashBearerToken("secret-session-token");
  assert.equal(hash.length, 64);
  assert.equal(hash, hashBearerToken("secret-session-token"));
  assert.notEqual(hash, "secret-session-token");
});

test("bearer token parsing is fail-closed", () => {
  assert.equal(readBearerToken(new Request("https://peos.test")), null);
  assert.equal(
    readBearerToken(
      new Request("https://peos.test", { headers: { authorization: "Bearer abc123" } }),
    ),
    "abc123",
  );
  assert.equal(
    readBearerToken(
      new Request("https://peos.test", { headers: { authorization: "Basic abc123" } }),
    ),
    null,
  );
});

test("successful session introspection records last use without persisting the raw bearer", async () => {
  const calls: Array<{ text: string; values?: unknown[] }> = [];
  const pool = {
    async query(text: string, values?: unknown[]) {
      calls.push({ text, values });
      return {
        rows: [
          {
            session_id: "session-1",
            person_id: "person-1",
            issued_at: new Date("2026-09-05T12:00:00.000Z"),
            expires_at: new Date("2026-09-05T20:00:00.000Z"),
          },
        ],
      };
    },
  } as unknown as Pool;

  const now = new Date("2026-09-05T13:00:00.000Z");
  const session = await introspectBearerSession(pool, "raw-session-token", now);

  assert.deepEqual(session, {
    sessionId: "session-1",
    personId: "person-1",
    issuedAt: "2026-09-05T12:00:00.000Z",
    expiresAt: "2026-09-05T20:00:00.000Z",
  });

  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /SET last_used_at = \$2/);
  assert.match(calls[0]!.text, /s\.revoked_at IS NULL/);
  assert.match(calls[0]!.text, /s\.expires_at > \$2/);
  assert.match(calls[0]!.text, /a\.status = 'ACTIVE'/);
  assert.match(calls[0]!.text, /p\.status = 'ACTIVE'/);
  assert.notEqual(calls[0]!.values?.[0], "raw-session-token");
  assert.equal(calls[0]!.values?.[0], hashBearerToken("raw-session-token"));
  assert.equal(calls[0]!.values?.[1], now);
});
