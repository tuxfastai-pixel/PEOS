import type { Pool } from "pg";
import { assertSchoolFinancePermission } from "./authorization";
import { transaction } from "../school-admin/service";
import { FinanceValidationError } from "./transactions";

type Base = { schoolId: string; actorId: string; reconciliationId: string };

export async function submitSchoolReconciliation(pool: Pool, input: Base) {
  return transaction(pool, async db => {
    await assertSchoolFinancePermission(db,input.actorId,input.schoolId,"finance.reconciliation.prepare");
    const result = await db.query<{id:string}>(
      `UPDATE school_finance.reconciliations
       SET status='SUBMITTED',submitted_at=now()
       WHERE id=$1 AND school_id=$2 AND prepared_by=$3 AND status='DRAFT'
       RETURNING id`,
      [input.reconciliationId,input.schoolId,input.actorId],
    );
    if (!result.rows[0]) throw new FinanceValidationError("RECONCILIATION_NOT_SUBMITTABLE");
    await db.query(
      `INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata)
       VALUES ($1,'FINANCE_RECONCILIATION_SUBMITTED','SCHOOL_FINANCE_RECONCILIATION',$2,'ALLOW',$3::jsonb)`,
      [input.actorId,input.reconciliationId,JSON.stringify({schoolId:input.schoolId})],
    );
    return {reconciliationId:result.rows[0].id,status:"SUBMITTED" as const};
  });
}

export async function reviewSchoolReconciliation(
  pool: Pool, input: Base & { decision: "APPROVED" | "REJECTED" },
) {
  return transaction(pool, async db => {
    await assertSchoolFinancePermission(db,input.actorId,input.schoolId,"finance.reconciliation.approve");
    const result = await db.query<{id:string}>(
      `UPDATE school_finance.reconciliations
       SET status=$4,reviewed_by=$3,reviewed_at=now()
       WHERE id=$1 AND school_id=$2 AND status='SUBMITTED'
         AND prepared_by<>$3
       RETURNING id`,
      [input.reconciliationId,input.schoolId,input.actorId,input.decision],
    );
    if (!result.rows[0]) throw new FinanceValidationError("RECONCILIATION_NOT_REVIEWABLE");
    await db.query(
      `INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,metadata)
       VALUES ($1,'FINANCE_RECONCILIATION_REVIEWED','SCHOOL_FINANCE_RECONCILIATION',$2,'ALLOW',$3::jsonb)`,
      [input.actorId,input.reconciliationId,JSON.stringify({schoolId:input.schoolId,decision:input.decision})],
    );
    return {reconciliationId:result.rows[0].id,status:input.decision};
  });
}
