import type { Pool } from "pg";
import { z } from "zod";
import { assertSchoolFinancePermission } from "./authorization";
import { transaction } from "../school-admin/service";

const uuid = z.string().uuid();
const money = z.number().int().safe().positive();
export const invoiceInput = z.object({
  learnerPersonId: uuid, feeScheduleId: uuid.optional(), invoiceNumber: z.string().trim().min(1).max(80),
  amountCents: money, dueDate: z.string().regex(/^\\d{4}-\\d{2}-\\d{2}$/),
}).strict();
export const paymentInput = z.object({
  paymentReference: z.string().trim().min(1).max(120), amountCents: money,
  receivedAt: z.string().datetime({ offset: true }),
  source: z.enum(["BANK_TRANSFER", "CARD", "CASH", "OTHER"]),
}).strict();
export const allocationInput = z.object({ paymentId: uuid, invoiceId: uuid, amountCents: money }).strict();

export class FinanceTransactionError extends Error {
  constructor(public readonly code: string, public readonly status = 409) { super(code); }
}

export async function issueInvoice(pool: Pool, actor: string, schoolId: string, input: unknown) {
  const value = invoiceInput.parse(input);
  return transaction(pool, async db => {
    await assertSchoolFinancePermission(db, actor, schoolId, "finance.transactions.record");
    if (value.feeScheduleId) {
      const fee = await db.query("SELECT id, currency, amount_cents FROM school_finance.fee_schedules WHERE id=$1 AND school_id=$2 AND status='ACTIVE' FOR SHARE", [value.feeScheduleId,schoolId]);
      if (!fee.rowCount || fee.rows[0].currency !== "ZAR" || Number(fee.rows[0].amount_cents) !== value.amountCents)
        throw new FinanceTransactionError("FEE_SCHEDULE_MISMATCH");
    }
    const learner = await db.query(`SELECT 1 FROM organisation.memberships
      WHERE person_id=$1 AND organisation_id=$2 AND membership_type='LEARNER'
        AND status='ACTIVE' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now())`,
      [value.learnerPersonId, schoolId]);
    if (!learner.rowCount) throw new FinanceTransactionError("LEARNER_NOT_ENROLLED");
    const result = await db.query(`INSERT INTO school_finance.invoices
      (school_id,learner_person_id,fee_schedule_id,invoice_number,amount_cents,due_date,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id,invoice_number,amount_cents`,
      [schoolId,value.learnerPersonId,value.feeScheduleId ?? null,value.invoiceNumber,value.amountCents,value.dueDate,actor]);
    await db.query("INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata) VALUES ($1,$2,$3,$4,'ALLOW',$5::jsonb)", [actor, "FINANCE_INVOICE_ISSUED", "INVOICE", result.rows[0].id, JSON.stringify({ schoolId })]);
    return result.rows[0];
  });
}

export async function recordPayment(pool: Pool, actor: string, schoolId: string, input: unknown) {
  const value = paymentInput.parse(input);
  return transaction(pool, async db => {
    await assertSchoolFinancePermission(db, actor, schoolId, "finance.transactions.record");
    const result = await db.query(`INSERT INTO school_finance.payments
      (school_id,payment_reference,amount_cents,received_at,source,recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id,payment_reference,amount_cents`,
      [schoolId,value.paymentReference,value.amountCents,value.receivedAt,value.source,actor]);
    await db.query("INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata) VALUES ($1,$2,$3,$4,'ALLOW',$5::jsonb)", [actor, "FINANCE_PAYMENT_RECORDED", "PAYMENT", result.rows[0].id, JSON.stringify({ schoolId })]);
    return result.rows[0];
  });
}

/** Serializes allocations for each invoice and payment to prevent concurrent over-allocation. */
export async function allocatePayment(pool: Pool, actor: string, schoolId: string, input: unknown) {
  const value = allocationInput.parse(input);
  return transaction(pool, async db => {
    await assertSchoolFinancePermission(db, actor, schoolId, "finance.transactions.record");
    // Lock order is stable across all allocations: payment first, then invoice.
    const payment = await db.query("SELECT id,amount_cents,currency FROM school_finance.payments WHERE id=$1 AND school_id=$2 FOR UPDATE", [value.paymentId,schoolId]);
    const invoice = await db.query("SELECT id,amount_cents,currency,status FROM school_finance.invoices WHERE id=$1 AND school_id=$2 FOR UPDATE", [value.invoiceId,schoolId]);
    if (!payment.rowCount || !invoice.rowCount || invoice.rows[0].status !== "ISSUED")
      throw new FinanceTransactionError("PAYMENT_OR_INVOICE_UNAVAILABLE");
    if (payment.rows[0].currency !== invoice.rows[0].currency)
      throw new FinanceTransactionError("CURRENCY_MISMATCH");
    const allocated = await db.query(`SELECT
      (SELECT COALESCE(SUM(amount_cents),0) FROM school_finance.payment_allocations WHERE school_id=$1 AND payment_id=$2) AS payment_used,
      (SELECT COALESCE(SUM(amount_cents),0) FROM school_finance.payment_allocations WHERE school_id=$1 AND invoice_id=$3) AS invoice_paid`,
      [schoolId,value.paymentId,value.invoiceId]);
    const used = allocated.rows[0];
    if (BigInt(payment.rows[0].amount_cents) - BigInt(used.payment_used) < BigInt(value.amountCents)
      || BigInt(invoice.rows[0].amount_cents) - BigInt(used.invoice_paid) < BigInt(value.amountCents))
      throw new FinanceTransactionError("ALLOCATION_EXCEEDS_BALANCE");
    const result = await db.query(`INSERT INTO school_finance.payment_allocations
      (school_id,payment_id,invoice_id,amount_cents,allocated_by) VALUES ($1,$2,$3,$4,$5)
      RETURNING id,amount_cents`, [schoolId,value.paymentId,value.invoiceId,value.amountCents,actor]);
    await db.query("INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata) VALUES ($1,$2,$3,$4,'ALLOW',$5::jsonb)", [actor, "FINANCE_PAYMENT_ALLOCATED", "PAYMENT_ALLOCATION", result.rows[0].id, JSON.stringify({ schoolId })]);
    return result.rows[0];
  });
}
