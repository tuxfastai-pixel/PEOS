import type { Pool } from "pg";
import { assertSchoolFinancePermission } from "./authorization";
import { transaction } from "../school-admin/service";
import { FinanceValidationError } from "./transactions";

type CreateInput = { schoolId:string; actorId:string; periodStart:string; periodEnd:string };
const isoDate = /^\d{4}-\d{2}-\d{2}$/;

export async function createSchoolReconciliation(pool:Pool,input:CreateInput) {
  if (!isoDate.test(input.periodStart) || !isoDate.test(input.periodEnd) ||
      !Number.isFinite(Date.parse(input.periodStart)) || !Number.isFinite(Date.parse(input.periodEnd)) ||
      input.periodEnd < input.periodStart)
    throw new FinanceValidationError("INVALID_RECONCILIATION_PERIOD");
  return transaction(pool,async db => {
    await assertSchoolFinancePermission(db,input.actorId,input.schoolId,"finance.reconciliation.prepare");
    const result = await db.query<{id:string}>(
      `INSERT INTO school_finance.reconciliations(school_id,period_start,period_end,prepared_by)
       VALUES ($1,$2,$3,$4) RETURNING id`,
      [input.schoolId,input.periodStart,input.periodEnd,input.actorId],
    );
    await db.query(
      `INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata)
       VALUES ($1,'FINANCE_RECONCILIATION_CREATED','SCHOOL_FINANCE_RECONCILIATION',$2,'ALLOW',$3::jsonb)`,
      [input.actorId,result.rows[0].id,JSON.stringify({schoolId:input.schoolId,periodStart:input.periodStart,periodEnd:input.periodEnd})],
    );
    return {reconciliationId:result.rows[0].id,status:"DRAFT" as const};
  });
}

export async function getSchoolFinanceSummary(pool:Pool,schoolId:string,actorId:string) {
  await assertSchoolFinancePermission(pool,actorId,schoolId,"finance.summary.read");
  const result = await pool.query<{
    invoiced_cents:string;paid_cents:string;allocated_cents:string;unallocated_cents:string;
  }>(
    `SELECT
       (SELECT COALESCE(SUM(amount_cents),0)::text FROM school_finance.invoices
        WHERE school_id=$1 AND status='ISSUED') AS invoiced_cents,
       (SELECT COALESCE(SUM(amount_cents),0)::text FROM school_finance.payments
        WHERE school_id=$1) AS paid_cents,
       (SELECT COALESCE(SUM(a.amount_cents),0)::text FROM school_finance.payment_allocations a
        JOIN school_finance.invoices i ON i.id=a.invoice_id AND i.school_id=a.school_id
        WHERE a.school_id=$1 AND i.status='ISSUED') AS allocated_cents,
       (SELECT COALESCE(SUM(p.amount_cents),0)::text FROM school_finance.payments p WHERE p.school_id=$1)
       AS unallocated_cents`,
    [schoolId],
  );
  const row=result.rows[0];
  const invoiced=BigInt(row.invoiced_cents);
  const allocated=BigInt(row.allocated_cents);
  const paid=BigInt(row.paid_cents);
  return {
    invoicedCents:invoiced.toString(),
    receivedCents:paid.toString(),
    allocatedCents:allocated.toString(),
    outstandingCents:(invoiced-allocated).toString(),
    unallocatedCents:(paid-allocated).toString(),
  };
}
