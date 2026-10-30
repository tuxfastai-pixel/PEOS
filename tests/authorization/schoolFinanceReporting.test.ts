import assert from "node:assert/strict";
import test from "node:test";
import { createSchoolReconciliation } from "../../domains/school-finance/reporting";
import { FinanceValidationError } from "../../domains/school-finance/transactions";

test("reconciliation rejects invalid and reversed periods without database access",async () => {
  const pool={} as Parameters<typeof createSchoolReconciliation>[0];
  const base={schoolId:"school",actorId:"actor",periodStart:"2026-10-01",periodEnd:"2026-10-31"};
  for (const change of [{periodStart:"2026-11-01"},{periodStart:"bad"},{periodEnd:"2026-10-00"}]) {
    await assert.rejects(createSchoolReconciliation(pool,{...base,...change}),
      (error:unknown)=>error instanceof FinanceValidationError && error.code==="INVALID_RECONCILIATION_PERIOD");
  }
});
