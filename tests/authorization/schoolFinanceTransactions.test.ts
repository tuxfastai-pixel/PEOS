import assert from "node:assert/strict";
import test from "node:test";
import { allocatePayment, FinanceValidationError } from "../../domains/school-finance/transactions";

test("allocation rejects zero, negative, fractional and unsafe monetary values before database access", async () => {
  const pool = {} as Parameters<typeof allocatePayment>[0];
  for (const amountCents of [0, -1, 1.25, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(
      allocatePayment(pool, {schoolId:"school", personId:"person", paymentId:"payment", invoiceId:"invoice", amountCents}),
      (error: unknown) => error instanceof FinanceValidationError && error.code === "INVALID_AMOUNT",
    );
  }
});
