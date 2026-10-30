import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolReconciliation } from "../../domains/school-finance/reconciliation";
import { FinanceValidationError } from "../../domains/school-finance/transactions";

test("reconciliation creation rejects invalid and reversed periods", async () => {
  const pool = {} as Parameters<typeof createSchoolReconciliation>[0];
  const base = {schoolId:"school",actorId:"actor",periodStart:"2026-10-01",periodEnd:"2026-10-31"};
  for (const changed of [
    {periodStart:"2026-10-32"},
    {periodStart:"2026-11-01"},
    {periodEnd:"2026-02-30"},
    {periodEnd:"not-a-date"},
  ]) {
    await assert.rejects(
      createSchoolReconciliation(pool,{...base,...changed}),
      (error:unknown) => error instanceof FinanceValidationError && error.code === "INVALID_RECONCILIATION_PERIOD",
    );
  }
});
