import type { Pool } from "pg";
import {
  assertSchoolFinancePermission,
  FinanceAccessDenied,
} from "./authorization";
import {
  canPerformSchoolFinanceAction,
  type FinanceAction,
  type SchoolFinanceRole,
} from "./permissions";

export const financeActions: FinanceAction[] = [
  "finance.summary.read",
  "finance.transactions.read",
  "finance.transactions.record",
  "finance.reconciliation.prepare",
  "finance.reconciliation.approve",
  "finance.policy.manage",
  "finance.expenditure.approve",
  "finance.audit.read",
  "finance.payments.verify",
];
export async function listFinanceSchools(db: Pool, personId: string) {
  const result = await db.query<{
    id: string;
    displayName: string;
    roles: SchoolFinanceRole[];
  }>(
    `
    SELECT o.id,o.display_name AS "displayName",array_agg(DISTINCT r.code) AS roles
    FROM identity.persons p JOIN organisation.memberships m ON m.person_id=p.id
    JOIN organisation.organisations o ON o.id=m.organisation_id
    JOIN access.role_assignments ra ON ra.person_id=p.id AND ra.organisation_id=o.id
    JOIN access.roles r ON r.id=ra.role_id
    WHERE p.id=$1 AND p.status='ACTIVE' AND o.status='ACTIVE' AND o.organisation_type='SCHOOL'
      AND m.membership_type='STAFF' AND m.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
      AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now())
      AND r.code IN ('PRINCIPAL','FINANCE_MANAGER','FINANCE_OFFICER')
    GROUP BY o.id,o.display_name ORDER BY lower(o.display_name),o.id LIMIT 101`,
    [personId],
  );
  return {
    schools: result.rows
      .slice(0, 100)
      .map((row) => ({
        id: row.id,
        displayName: row.displayName,
        actions: financeActions.filter((action) =>
          canPerformSchoolFinanceAction(row.roles, action),
        ),
      })),
    truncated: result.rows.length > 100,
  };
}

/** Exact school reference lookup, only minimum fields needed for fee invoicing. */
export async function financeLearner(
  db: Pool,
  personId: string,
  schoolId: string,
  reference: string,
) {
  const client = await db.connect();
  try {
    await client.query("BEGIN");
    await assertSchoolFinancePermission(
      client,
      personId,
      schoolId,
      "finance.transactions.record",
    );
    const result = await client.query<{
      personId: string;
      admissionNumber: string;
      givenName: string;
      familyName: string;
    }>(
      `
      SELECT p.id AS "personId",r.admission_number AS "admissionNumber",n.given_name AS "givenName",n.family_name AS "familyName"
      FROM organisation.learner_registrations r JOIN identity.persons p ON p.id=r.learner_person_id
      JOIN identity.person_names n ON n.person_id=p.id
      JOIN organisation.memberships m ON m.person_id=p.id AND m.organisation_id=r.school_id
      WHERE r.school_id=$1 AND r.admission_number=$2 AND r.status='ACTIVE' AND p.status='ACTIVE'
        AND m.membership_type='LEARNER' AND m.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())`,
      [schoolId, reference],
    );
    if (result.rows.length !== 1) throw new FinanceAccessDenied();
    await client.query(
      `INSERT INTO audit.events(actor_person_id,action,resource_type,resource_id,decision,reason)
      VALUES($1,'finance.learner.lookup','SCHOOL',$2,'ALLOW','current_finance_scope')`,
      [personId, schoolId],
    );
    await client.query("COMMIT");
    return result.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function revokeFinanceStaff(
  pool: Pool,
  actor: string,
  schoolId: string,
  invitationId: string,
) {
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    const { assertSchoolPrincipal, audit, AdminError } = await import(
      "../school-admin/service"
    );
    await assertSchoolPrincipal(db, actor, schoolId);
    const invite = await db.query<{ accepted_by: string; role_code: string }>(
      `SELECT accepted_by,role_code FROM organisation.staff_invitations WHERE id=$1 AND school_id=$2 AND accepted_at IS NOT NULL AND role_code IN ('FINANCE_MANAGER','FINANCE_OFFICER') FOR UPDATE`,
      [invitationId, schoolId],
    );
    if (!invite.rows[0] || invite.rows[0].accepted_by === actor)
      throw new AdminError("FINANCE_STAFF_UNAVAILABLE", 403);
    await db.query(
      `UPDATE access.role_assignments SET status='ENDED',ends_at=now() WHERE person_id=$1 AND organisation_id=$2 AND role_id=(SELECT id FROM access.roles WHERE code=$3) AND status='ACTIVE'`,
      [invite.rows[0].accepted_by, schoolId, invite.rows[0].role_code],
    );
    await audit(db, actor, "finance.staff.revoke", schoolId, invitationId);
    await db.query("COMMIT");
    return { revoked: true };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally {
    db.release();
  }
}
