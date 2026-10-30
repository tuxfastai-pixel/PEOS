import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolInvoice, recordSchoolPayment } from "../../domains/school-finance/invoicing";
import { FinanceValidationError } from "../../domains/school-finance/transactions";

const pool = {} as Parameters<typeof createSchoolInvoice>[0];
test("invoice input validation rejects malformed values before opening a transaction", async () => {
  const base = {schoolId:"school",actorId:"actor",learnerId:"learner",invoiceNumber:"INV-1",amountCents:500,dueDate:"2026-11-30"};
  for (const changed of [{amountCents:0},{amountCents:1.5},{dueDate:"tomorrow"},{invoiceNumber:""},{currency:"zar"}]) {
    await assert.rejects(createSchoolInvoice(pool,{...base,...changed}), (error:unknown) => error instanceof FinanceValidationError);
  }
});
test("payment input validation rejects invalid amounts and references", async () => {
  const base = {schoolId:"school",actorId:"actor",paymentReference:"BANK-1",amountCents:100,receivedAt:"2026-10-30T12:00:00Z",source:"BANK_TRANSFER" as const};
  for (const changed of [{amountCents:-10},{paymentReference:""},{receivedAt:"invalid"},{currency:"invalid"}]) {
    await assert.rejects(recordSchoolPayment(pool,{...base,...changed}), (error:unknown) => error instanceof FinanceValidationError);
  }
});
