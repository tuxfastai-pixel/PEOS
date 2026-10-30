import type { Pool } from "pg";
import { z } from "zod";
import { transaction } from "../school-admin/service";
import { assertSchoolFinancePermission } from "./authorization";
import { FinanceValidationError } from "./transactions";

const uuid = z.string().uuid();
export const invoiceInput = z.object({
  schoolId: uuid, personId: uuid, learnerPersonId: uuid,
  invoiceNumber: z.string().trim().min(1).max(80),
  amountCents: z.number().int().safe().nonnegative(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("ZAR"),
  dueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
}).strict();
export const paymentInput = z.object({
  schoolId: uuid, personId: uuid,
  paymentReference: z.string().trim().min(1).max(120),
  amountCents: z.number().int().safe().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/).default("ZAR"),
  receivedAt: z.string().datetime({offset:true}),
  source: z.enum(["BANK_TRANSFER","CARD","CASH","OTHER"]),
}).strict();

export async function issueInvoice(pool: Pool, raw: z.input<typeof invoiceInput>) {
  const input = invoiceInput.parse(raw);
  return transaction(pool, async db => {
    await assertSchoolFinancePermission(db, input.personId, input.schoolId, "finance.transactions.record");
    const result = await db.query<{id:string}>(
      `INSERT INTO school_finance.invoices
      (school_id,learner_person_id,invoice_number,currency,amount_cents,due_date,created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [input.schoolId,input.learnerPersonId,input.invoiceNumber,input.currency,input.amountCents,input.dueDate,input.personId],
    );
    await db.query(
      `INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata)
      VALUES ($1,'FINANCE_INVOICE_ISSUED','SCHOOL_FINANCE_INVOICE',$2,'ALLOW',$3::jsonb)`,
      [input.personId,result.rows[0].id,JSON.stringify({schoolId:input.schoolId,learnerPersonId:input.learnerPersonId,amountCents:input.amountCents})],
    );
    return {invoiceId:result.rows[0].id};
  });
}

export async function recordPayment(pool: Pool, raw: z.input<typeof paymentInput>) {
  const input = paymentInput.parse(raw);
  return transaction(pool, async db => {
    await assertSchoolFinancePermission(db,input.personId,input.schoolId,"finance.transactions.record");
    const result = await db.query<{id:string}>(
      `INSERT INTO school_finance.payments
      (school_id,payment_reference,currency,amount_cents,received_at,source,recorded_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [input.schoolId,input.paymentReference,input.currency,input.amountCents,input.receivedAt,input.source,input.personId],
    );
    await db.query(
      `INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata)
      VALUES ($1,'FINANCE_PAYMENT_RECORDED','SCHOOL_FINANCE_PAYMENT',$2,'ALLOW',$3::jsonb)`,
      [input.personId,result.rows[0].id,JSON.stringify({schoolId:input.schoolId,paymentReference:input.paymentReference,amountCents:input.amountCents})],
    );
    return {paymentId:result.rows[0].id};
  });
}

/** Balance is derived from posted invoice and allocations, never a mutable cached field. */
export async function invoiceOutstandingCents(pool: Pool, schoolId: string, personId: string, invoiceId: string) {
  await assertSchoolFinancePermission(pool,personId,schoolId,"finance.transactions.read");
  const result = await pool.query<{outstanding_cents:string}>(
    `SELECT (i.amount_cents-COALESCE(SUM(a.amount_cents),0))::text AS outstanding_cents
     FROM school_finance.invoices i
     LEFT JOIN school_finance.payment_allocations a ON a.invoice_id=i.id AND a.school_id=i.school_id
     WHERE i.school_id=$1 AND i.id=$2 AND i.status='ISSUED'
     GROUP BY i.id,i.amount_cents`,[schoolId,invoiceId],
  );
  if (!result.rows[0]) throw new FinanceValidationError("FINANCE_RECORD_NOT_FOUND");
  return {outstandingCents:result.rows[0].outstanding_cents};
}
