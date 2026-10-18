import assert from "node:assert/strict";
import test from "node:test";
import type { Pool } from "pg";
import { verifiedRecipient } from "../../domains/school-admin/recipient";
import { invitationSchema, inviteTokenSchema } from "../../domains/school-admin/service";

const config = { issuer: "https://issuer.example.test/auth/v1", audience: "authenticated", jwksUrl: "https://issuer.example.test/keys", publishableKey: "public-test-key" };
const identity = { provider: config.issuer, subject: "external-user" };
const verifier = { verify: async () => identity };
const pool = { query: async (_sql: string, values: string[]) => {
  assert.deepEqual(values, [config.issuer, "external-user", "person"]); return { rows: [{ id: "credential" }] };
} } as unknown as Pool;
const user = { id: "external-user", email: "Pilot@Example.test", email_confirmed_at: "2026-10-18T10:00:00Z", is_anonymous: false };

test("invitation recipient comes from fresh provider verification bound to the PEOS person", async () => {
  const fetchImpl: typeof fetch = async (url, options) => {
    assert.equal(url, `${config.issuer}/user`);
    assert.equal(new Headers(options?.headers).get("authorization"), "Bearer signed-token");
    assert.equal(options?.cache, "no-store");
    return Response.json(user);
  };
  assert.equal(await verifiedRecipient(pool, "person", "signed-token", config, fetchImpl, verifier), "pilot@example.test");
});

for (const change of [{ email_confirmed_at: null }, { is_anonymous: true }, { id: "different-user" }, { email: undefined, user_metadata: { email: "pilot@example.test" } }]) {
  test(`unverified or mismatched provider proof is denied: ${JSON.stringify(change)}`, async () => {
    await assert.rejects(verifiedRecipient(pool, "person", "signed-token", config,
      async () => Response.json({ ...user, ...change }), verifier), /VERIFIED_RECIPIENT_REQUIRED/);
  });
}

test("a token belonging to a different PEOS person cannot accept an invitation", async () => {
  const noBinding = { query: async () => ({ rows: [] }) } as unknown as Pool;
  await assert.rejects(verifiedRecipient(noBinding, "other-person", "token", config, async () => Response.json(user), verifier), /VERIFIED_RECIPIENT_REQUIRED/);
});

test("invalid signed identity does not call the provider or database", async () => {
  await assert.rejects(verifiedRecipient(pool, "person", "invalid", config,
    async () => { throw new Error("should not fetch"); }, { verify: async () => { throw new Error("JWT invalid"); } }), /VERIFIED_RECIPIENT_REQUIRED/);
});

test("invitation input rejects elevated roles, extra fields and malformed tokens", () => {
  assert.throws(() => invitationSchema.parse({ email: "person@example.test", roleCode: "FOUNDER" }));
  assert.throws(() => invitationSchema.parse({ email: "person@example.test", roleCode: "TEACHER", personId: "spoofed" }));
  assert.throws(() => inviteTokenSchema.parse("short"));
});
