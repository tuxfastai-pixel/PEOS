import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";

import { revokeBearerSession } from "../../platform/session/service";

test("session revocation never queries by raw bearer token", async () => {
  let values: unknown[] | undefined;
  const pool = {
    async query(_text: string, queryValues?: unknown[]) {
      values = queryValues;
      return { rows: [{ session_id: "session-1", person_id: "person-1" }] };
    },
  } as unknown as Pool;

  const token = "raw-secret-session-token";
  const result = await revokeBearerSession(pool, token, new Date("2026-09-05T15:00:00.000Z"));

  assert.deepEqual(result, { sessionId: "session-1", personId: "person-1" });
  assert.ok(values);
  assert.notEqual(values[0], token);
  assert.equal(typeof values[0], "string");
  assert.equal((values[0] as string).length, 64);
});
