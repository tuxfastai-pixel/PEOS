import assert from "node:assert/strict";
import test from "node:test";
import { activeSchoolFinanceRoles, assertSchoolFinancePermission } from "../../domains/school-finance/authorization";

test("finance authorization is denied when membership query yields no active roles", async () => {
  const db = { query: async () => ({ rows: [] }) } as any;
  assert.deepEqual(await activeSchoolFinanceRoles(db, "person", "school"), []);
  await assert.rejects(assertSchoolFinancePermission(db, "person", "school", "finance.summary.read"), /SCHOOL_FINANCE_FORBIDDEN/);
});
test("principal can read financial summary when current school authority is present", async () => {
  const db = { query: async (_sql: string, params: unknown[]) => {
    assert.deepEqual(params, ["person", "school"]);
    return { rows: [{code: "PRINCIPAL"}] };
  } } as any;
  await assert.doesNotReject(assertSchoolFinancePermission(db, "person", "school", "finance.summary.read"));
});
test("administrator cannot elevate finance authority using school admin role", async () => {
  const db = { query: async () => ({ rows: [{code:"SCHOOL_ADMINISTRATOR"}] }) } as any;
  await assert.rejects(assertSchoolFinancePermission(db, "person", "school", "finance.transactions.read"), /SCHOOL_FINANCE_FORBIDDEN/);
});
