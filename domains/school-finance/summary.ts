import type { Pool } from "pg";
import { assertSchoolFinancePermission } from "./authorization";

/** School-scoped financial snapshot; all monetary values are returned as decimal strings of cents. */
export async function getSchoolFinanceSummary(pool: Pool, schoolId: string, actorId: string) {
  await assertSchoolFinancePermission(pool, actorId, schoolId, "finance.summary.read");
  const [invoices, payments, allocations, reconciliations] = await Promise.all([
    pool.query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(amount_cents),0)::text AS total,COUNT(*)::text AS count
       FROM school_finance.invoices WHERE school_id=$1 AND status='ISSUED'`,[schoolId]),
    pool.query<{ total: string; count: string }>(
      `SELECT COALESCE(SUM(amount_cents),0)::text AS total,COUNT(*)::text AS count
       FROM school_finance.payments WHERE school_id=$1`,[schoolId]),
    pool.query<{ total: string }>(
      `SELECT COALESCE(SUM(a.amount_cents),0)::text AS total
       FROM school_finance.payment_allocations a
       JOIN school_finance.invoices i ON i.id=a.invoice_id AND i.school_id=a.school_id
       WHERE a.school_id=$1 AND i.status='ISSUED'`,[schoolId]),
    pool.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM school_finance.reconciliations
       WHERE school_id=$1 AND status='SUBMITTED'`,[schoolId]),
  ]);
  const invoiced = BigInt(invoices.rows[0]?.total ?? "0");
  const paid = BigInt(payments.rows[0]?.total ?? "0");
  const allocated = BigInt(allocations.rows[0]?.total ?? "0");
  return {
    schoolId,
    currency: "ZAR",
    invoicedCents: invoiced.toString(),
    recordedPaymentsCents: paid.toString(),
    allocatedToIssuedInvoicesCents: allocated.toString(),
    outstandingInvoiceCents: (invoiced - allocated).toString(),
    unallocatedPaymentsCents: (paid - allocated).toString(),
    invoiceCount: invoices.rows[0]?.count ?? "0",
    paymentCount: payments.rows[0]?.count ?? "0",
    pendingReconciliations: reconciliations.rows[0]?.count ?? "0",
  };
}
