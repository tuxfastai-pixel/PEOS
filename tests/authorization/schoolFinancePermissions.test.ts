import assert from "node:assert/strict";
import test from "node:test";
import { canPerformSchoolFinanceAction } from "../../domains/school-finance/permissions";

test("principal has exclusive approval and audit authority", () => {
  for (const action of ["finance.policy.manage", "finance.expenditure.approve", "finance.reconciliation.approve", "finance.audit.read"] as const) {
    assert.equal(canPerformSchoolFinanceAction(["PRINCIPAL"], action), true);
    for (const role of ["SCHOOL_ADMINISTRATOR", "FINANCE_MANAGER", "FINANCE_OFFICER", "TEACHER", "PARENT"] as const)
      assert.equal(canPerformSchoolFinanceAction([role], action), false);
  }
});
test("finance staff may prepare but never approve reconciliation", () => {
  for (const role of ["FINANCE_MANAGER", "FINANCE_OFFICER"] as const) {
    assert.equal(canPerformSchoolFinanceAction([role], "finance.reconciliation.prepare"), true);
    assert.equal(canPerformSchoolFinanceAction([role], "finance.reconciliation.approve"), false);
  }
});
test("administrator and unrelated roles have no implicit finance access", () => {
  for (const role of ["SCHOOL_ADMINISTRATOR", "TEACHER", "PARENT"] as const)
    assert.equal(canPerformSchoolFinanceAction([role], "finance.transactions.read"), false);
  assert.equal(canPerformSchoolFinanceAction([], "finance.summary.read"), false);
});
