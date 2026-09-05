import assert from "node:assert/strict";
import test from "node:test";

import { checkDatabaseReady } from "../../platform/health/readiness";

test("database readiness succeeds when probe succeeds", async () => {
  const ready = await checkDatabaseReady(async () => undefined);
  assert.equal(ready, true);
});

test("database readiness fails closed when probe fails", async () => {
  const ready = await checkDatabaseReady(async () => {
    throw new Error("database unavailable");
  });

  assert.equal(ready, false);
});
