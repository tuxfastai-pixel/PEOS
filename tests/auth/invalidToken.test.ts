import assert from "node:assert/strict";
import test from "node:test";
import { POST } from "../../app/v1/sessions/exchange/route";

test("malformed bearer tokens return 401 without reaching the database", async () => {
  const names = ["OIDC_ISSUER", "OIDC_AUDIENCE", "OIDC_JWKS_URL", "DATABASE_URL"] as const;
  const saved = names.map(key => process.env[key]);
  process.env.OIDC_ISSUER = "https://issuer.example.test";
  process.env.OIDC_AUDIENCE = "authenticated";
  process.env.OIDC_JWKS_URL = "https://issuer.example.test/.well-known/jwks.json";
  process.env.DATABASE_URL = "postgresql://test:test@127.0.0.1:1/test";
  try {
    for (const token of ["invalid-token", "invalid.invalid.invalid"]) {
      const response = await POST(new Request("https://peos.example.test/v1/sessions/exchange", {
        method: "POST", headers: { authorization: `Bearer ${token}` },
      }));
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "UNAUTHENTICATED" });
    }
  } finally {
    names.forEach((key, index) => { if (saved[index] === undefined) delete process.env[key]; else process.env[key] = saved[index]; });
  }
});
