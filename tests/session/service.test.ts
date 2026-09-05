import assert from "node:assert/strict";
import test from "node:test";
import { hashBearerToken, readBearerToken } from "../../platform/session/service";

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
