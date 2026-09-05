import assert from "node:assert/strict";
import test from "node:test";
import { readServerEnvironment } from "../../platform/config/env";

test("blank optional database URL is normalized", () => {
  const env = readServerEnvironment({ NODE_ENV: "test", DATABASE_URL: "" });
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.PEOS_SESSION_ISSUER, "peos");
});

test("invalid node environment is rejected", () => {
  assert.throws(() =>
    readServerEnvironment({ NODE_ENV: "invalid" } as unknown as NodeJS.ProcessEnv),
  );
});
