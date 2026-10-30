/** School-scoped finance permissions. This is a policy foundation, not a financial ledger or API. */
export type SchoolFinanceRole = "PRINCIPAL" | "SCHOOL_ADMINISTRATOR" | "FINANCE_OFFICER" | "FINANCE_MANAGER" | "TEACHER" | "PARENT";
export type FinanceAction =
  | "finance.summary.read"
  | "finance.transactions.read"
  | "finance.transactions.record"
  | "finance.reconciliation.prepare"
  | "finance.reconciliation.approve"
  | "finance.policy.manage"
  | "finance.expenditure.approve"
  | "finance.audit.read";

const permissions: Readonly<Record<FinanceAction, readonly SchoolFinanceRole[]>> = {
  "finance.summary.read": ["PRINCIPAL", "FINANCE_MANAGER"],
  "finance.transactions.read": ["PRINCIPAL", "FINANCE_MANAGER", "FINANCE_OFFICER"],
  "finance.transactions.record": ["FINANCE_MANAGER", "FINANCE_OFFICER"],
  "finance.reconciliation.prepare": ["FINANCE_MANAGER", "FINANCE_OFFICER"],
  "finance.reconciliation.approve": ["PRINCIPAL"],
  "finance.policy.manage": ["PRINCIPAL"],
  "finance.expenditure.approve": ["PRINCIPAL"],
  "finance.audit.read": ["PRINCIPAL"],
};

/**
 * Caller must obtain roles from current, active, school-scoped assignments on the
 * server. UI-selected roles, client claims and cross-school roles are not trusted.
 * Never authorize based on this function without verifying active membership.
 */
export function canPerformSchoolFinanceAction(
  activeSchoolRoles: readonly SchoolFinanceRole[],
  action: FinanceAction,
): boolean {
  return permissions[action].some(role => activeSchoolRoles.includes(role));
}
