import assert from "node:assert/strict";
import test from "node:test";
import { disabledInvitationTransport, invitationDelivery } from "../../domains/notifications/invitationDelivery";

test("disabled delivery does not contact a provider or claim to send an email", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error("Delivery must remain offline"); };
  try {
    assert.equal(invitationDelivery.emailEnabled, false);
    const result = await disabledInvitationTransport.send({ to: "teacher@example.test", subject: "Invitation", text: "private-token", html: "private-token" });
    assert.deepEqual(result, { status: "NOT_SENT", reason: "DELIVERY_NOT_CONFIGURED" });
    assert.ok(!JSON.stringify(result).includes("private-token"));
    assert.ok(!JSON.stringify(result).includes("teacher@example.test"));
  } finally { globalThis.fetch = original; }
});
