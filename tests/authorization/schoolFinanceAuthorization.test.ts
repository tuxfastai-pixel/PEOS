import assert from "node:assert/strict";
import test from "node:test";
import { assertSchoolFinancePermission } from "../../domains/school-finance/authorization";

test("finance authorization fails closed for missing active school roles", async () => {
  const db = { query: async () => ({ rows: [] }) };
  await assert.rejects(
    assertSchoolFinancePermission(db as never, "person", "school", "finance.transactions.read"),
    /SCHOOL_FINANCE_PERMISSION_REQUIRED/,
  );
});

test("finance authorization accepts only a server-resolved permitted role", async () => {
  const db = { query: async () => ({ rows: [{ code: "FINANCE_OFFICER" }] }) };
  await assert.doesNotReject(
    assertSchoolFinancePermission(db as never, "person", "school", "finance.transactions.record"),
  );
  await assert.rejects(
    assertSchoolFinancePermission(db as never, "person", "school", "finance.reconciliation.approve"),
    /SCHOOL_FINANCE_PERMISSION_REQUIRED/,
  );
});
