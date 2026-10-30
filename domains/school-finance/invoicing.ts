import type { Pool } from "pg";
import { assertSchoolFinancePermission } from "./authorization";
import { transaction } from "../school-admin/service";
import { FinanceValidationError } from "./transactions";

export type InvoiceInput = {
  schoolId: string; actorId: string; learnerId: string; invoiceNumber: string;
  amountCents: number; dueDate: string; currency?: string;
};
export type PaymentInput = {
  schoolId: string; actorId: string; paymentReference: string;
  amountCents: number; receivedAt: string;
  source: "BANK_TRANSFER" | "CARD" | "CASH" | "OTHER"; currency?: string;
};
function validateAmount(amountCents: number) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0)
    throw new FinanceValidationError("INVALID_AMOUNT");
}
function validateCurrency(currency: string) {
  if (!/^[A-Z]{3}$/.test(currency)) throw new FinanceValidationError("INVALID_CURRENCY");
}
function validateReference(value: string) {
  if (!value.trim() || value.length > 120) throw new FinanceValidationError("INVALID_REFERENCE");
}
function validateDate(value: string) {
  if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(value) || Number.isNaN(Date.parse(value)))
    throw new FinanceValidationError("INVALID_DATE");
}

export async function createSchoolInvoice(pool: Pool, input: InvoiceInput) {
  validateAmount(input.amountCents);
  validateReference(input.invoiceNumber);
  validateDate(input.dueDate);
  const currency = input.currency ?? "ZAR";
  validateCurrency(currency);
  return transaction(pool, async db => {
    await assertSchoolFinancePermission(db, input.actorId, input.schoolId, "finance.transactions.record");
    const learner = await db.query(
      `SELECT 1 FROM organisation.memberships
       WHERE organisation_id=$1 AND person_id=$2 AND membership_type='LEARNER'
       AND status='ACTIVE' AND starts_at<=now() AND (ends_at IS NULL OR ends_at>now())`,
      [input.schoolId, input.learnerId],
    );
    if (!learner.rowCount) throw new FinanceValidationError("LEARNER_NOT_ENROLLED");
    const result = await db.query<{id:string}>(
      `INSERT INTO school_finance.invoices
      (school_id,learner_person_id,invoice_number,amount_cents,due_date,currency,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [input.schoolId,input.learnerId,input.invoiceNumber,input.amountCents,input.dueDate,currency,input.actorId],
    );
    await db.query(
      `INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata)
      VALUES ($1,'FINANCE_INVOICE_CREATED','SCHOOL_FINANCE_INVOICE',$2,'ALLOW',$3::jsonb)`,
      [input.actorId,result.rows[0].id,JSON.stringify({schoolId:input.schoolId,amountCents:input.amountCents})],
    );
    return {invoiceId:result.rows[0].id};
  });
}

export async function recordSchoolPayment(pool: Pool, input: PaymentInput) {
  validateAmount(input.amountCents);
  validateReference(input.paymentReference);
  if (!Number.isFinite(Date.parse(input.receivedAt))) throw new FinanceValidationError("INVALID_DATE");
  const currency = input.currency ?? "ZAR";
  validateCurrency(currency);
  return transaction(pool, async db => {
    await assertSchoolFinancePermission(db,input.actorId,input.schoolId,"finance.transactions.record");
    const result = await db.query<{id:string}>(
      `INSERT INTO school_finance.payments
      (school_id,payment_reference,amount_cents,received_at,source,currency,recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [input.schoolId,input.paymentReference,input.amountCents,input.receivedAt,input.source,currency,input.actorId],
    );
    await db.query(
      `INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata)
      VALUES ($1,'FINANCE_PAYMENT_RECORDED','SCHOOL_FINANCE_PAYMENT',$2,'ALLOW',$3::jsonb)`,
      [input.actorId,result.rows[0].id,JSON.stringify({schoolId:input.schoolId,amountCents:input.amountCents,source:input.source})],
    );
    return {paymentId:result.rows[0].id};
  });
}

export async function getSchoolInvoiceBalance(pool: Pool, schoolId: string, actorId: string, invoiceId: string) {
  await assertSchoolFinancePermission(pool,actorId,schoolId,"finance.transactions.read");
  const result = await pool.query<{amount_cents:string;paid_cents:string;currency:string;status:string}>(
    `SELECT i.amount_cents::text,COALESCE(SUM(a.amount_cents),0)::text AS paid_cents,
       i.currency,i.status
     FROM school_finance.invoices i
     LEFT JOIN school_finance.payment_allocations a ON a.invoice_id=i.id AND a.school_id=i.school_id
     WHERE i.id=$1 AND i.school_id=$2
     GROUP BY i.id`,
    [invoiceId,schoolId],
  );
  if (!result.rows[0]) throw new FinanceValidationError("FINANCE_RECORD_NOT_FOUND");
  const invoice = result.rows[0];
  return {invoiceId,currency:invoice.currency,status:invoice.status,
    amountCents:invoice.amount_cents,paidCents:invoice.paid_cents,
    outstandingCents:(BigInt(invoice.amount_cents)-BigInt(invoice.paid_cents)).toString()};
}
