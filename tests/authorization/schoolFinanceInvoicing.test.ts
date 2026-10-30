import assert from "node:assert/strict";
import test from "node:test";
import { invoiceInput, paymentInput } from "../../domains/school-finance/invoicing";

test("invoice validation rejects unsafe money and malformed identifiers", () => {
  const base={schoolId:"00000000-0000-4000-8000-000000000001",personId:"00000000-0000-4000-8000-000000000002",learnerPersonId:"00000000-0000-4000-8000-000000000003",invoiceNumber:"INV-1",amountCents:100,dueDate:"2026-11-30"};
  assert.equal(invoiceInput.parse(base).currency,"ZAR");
  assert.equal(invoiceInput.safeParse({...base,amountCents:-1}).success,false);
  assert.equal(invoiceInput.safeParse({...base,amountCents:1.5}).success,false);
  assert.equal(invoiceInput.safeParse({...base,schoolId:"other-school"}).success,false);
});
test("payment validation requires a positive amount and known source", () => {
  const base={schoolId:"00000000-0000-4000-8000-000000000001",personId:"00000000-0000-4000-8000-000000000002",paymentReference:"BANK-1",amountCents:100,receivedAt:"2026-10-30T12:00:00Z",source:"BANK_TRANSFER"};
  assert.equal(paymentInput.safeParse(base).success,true);
  assert.equal(paymentInput.safeParse({...base,amountCents:0}).success,false);
  assert.equal(paymentInput.safeParse({...base,source:"UNKNOWN"}).success,false);
});
