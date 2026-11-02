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
test('payment verification requires principal or manager authority, never an officer',()=>{
 assert.equal(canPerformSchoolFinanceAction(['PRINCIPAL'],'finance.payments.verify'),true);
 assert.equal(canPerformSchoolFinanceAction(['FINANCE_MANAGER'],'finance.payments.verify'),true);
 for(const role of ['FINANCE_OFFICER','SCHOOL_ADMINISTRATOR','TEACHER','PARENT'] as const)assert.equal(canPerformSchoolFinanceAction([role],'finance.payments.verify'),false);
});


test("UI role switching cannot confer finance permissions without a current finance role", () => {
  const nonFinanceRoles = ["SCHOOL_ADMINISTRATOR", "TEACHER", "PARENT"] as const;
  const protectedActions = [
    "finance.summary.read",
    "finance.transactions.read",
    "finance.transactions.record",
    "finance.reconciliation.prepare",
    "finance.reconciliation.approve",
    "finance.policy.manage",
    "finance.expenditure.approve",
    "finance.audit.read",
    "finance.payments.verify",
  ] as const;
  for (const role of nonFinanceRoles) {
    for (const action of protectedActions)
      assert.equal(canPerformSchoolFinanceAction([role], action), false, role + " must not gain " + action);
  }
  assert.equal(canPerformSchoolFinanceAction(["SCHOOL_ADMINISTRATOR", "FINANCE_OFFICER"], "finance.policy.manage"), false);
  assert.equal(canPerformSchoolFinanceAction(["SCHOOL_ADMINISTRATOR", "FINANCE_MANAGER"], "finance.expenditure.approve"), false);
  assert.equal(canPerformSchoolFinanceAction(["PRINCIPAL", "SCHOOL_ADMINISTRATOR"], "finance.policy.manage"), true);
});
