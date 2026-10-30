import type { Pool, PoolClient } from "pg";
import { assertSchoolFinancePermission } from "./authorization";
import { transaction } from "../school-admin/service";

export class FinanceValidationError extends Error {
  readonly status = 409;
  constructor(public readonly code: string) { super(code); }
}

type Db = PoolClient;
type AllocationInput = { schoolId: string; personId: string; paymentId: string; invoiceId: string; amountCents: number };

function positiveCents(value: number) {
  if (!Number.isSafeInteger(value) || value <= 0) throw new FinanceValidationError("INVALID_AMOUNT");
}

/** Atomically allocate a payment to a school invoice without overpaying either side. */
export async function allocatePayment(pool: Pool, input: AllocationInput) {
  positiveCents(input.amountCents);
  return transaction(pool, async (db: Db) => {
    await assertSchoolFinancePermission(db, input.personId, input.schoolId, "finance.transactions.record");
    // Lock both source records in a deterministic order to serialize competing allocations.
    const payment = await db.query<{ amount_cents: string; currency: string }>(
      "SELECT amount_cents::text,currency FROM school_finance.payments WHERE id=$1 AND school_id=$2 FOR UPDATE",
      [input.paymentId, input.schoolId],
    );
    const invoice = await db.query<{ amount_cents: string; currency: string; status: string }>(
      "SELECT amount_cents::text,currency,status FROM school_finance.invoices WHERE id=$1 AND school_id=$2 FOR UPDATE",
      [input.invoiceId, input.schoolId],
    );
    if (!payment.rows[0] || !invoice.rows[0]) throw new FinanceValidationError("FINANCE_RECORD_NOT_FOUND");
    if (invoice.rows[0].status !== "ISSUED") throw new FinanceValidationError("INVOICE_NOT_PAYABLE");
    if (payment.rows[0].currency !== invoice.rows[0].currency) throw new FinanceValidationError("CURRENCY_MISMATCH");

    const paymentTotal = BigInt(payment.rows[0].amount_cents);
    const invoiceTotal = BigInt(invoice.rows[0].amount_cents);
    const paymentUsed = await db.query<{ used: string }>(
      "SELECT COALESCE(SUM(amount_cents),0)::text AS used FROM school_finance.payment_allocations WHERE payment_id=$1 AND school_id=$2",
      [input.paymentId, input.schoolId],
    );
    const invoicePaid = await db.query<{ used: string }>(
      "SELECT COALESCE(SUM(amount_cents),0)::text AS used FROM school_finance.payment_allocations WHERE invoice_id=$1 AND school_id=$2",
      [input.invoiceId, input.schoolId],
    );
    const amount = BigInt(input.amountCents);
    if (amount + BigInt(paymentUsed.rows[0]?.used ?? "0") > paymentTotal) throw new FinanceValidationError("PAYMENT_OVERALLOCATED");
    if (amount + BigInt(invoicePaid.rows[0]?.used ?? "0") > invoiceTotal) throw new FinanceValidationError("INVOICE_OVERPAID");

    const inserted = await db.query<{ id: string }>(
      `INSERT INTO school_finance.payment_allocations
       (school_id,payment_id,invoice_id,amount_cents,allocated_by)
       VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [input.schoolId, input.paymentId, input.invoiceId, input.amountCents, input.personId],
    );
    await db.query(
      `INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata)
       VALUES ($1,'FINANCE_PAYMENT_ALLOCATED','SCHOOL_FINANCE_ALLOCATION',$2,'ALLOW',$3::jsonb)`,
      [input.personId, inserted.rows[0].id, JSON.stringify({ schoolId: input.schoolId, paymentId: input.paymentId, invoiceId: input.invoiceId, amountCents: input.amountCents })],
    );
    return { allocationId: inserted.rows[0].id };
  });
}
