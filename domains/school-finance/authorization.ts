import type { Pool, PoolClient } from "pg";
import { AdminError, transaction } from "../school-admin/service";
import { canPerformSchoolFinanceAction, type FinanceAction, type SchoolFinanceRole } from "./permissions";

/** Always resolve current roles from the database, never from client claims. */
export async function assertSchoolFinancePermission(
  db: Pick<Pool, "query">,
  personId: string,
  schoolId: string,
  action: FinanceAction,
): Promise<void> {
  const result = await db.query<{ code: SchoolFinanceRole }>(`SELECT DISTINCT r.code
    FROM identity.persons p
    JOIN organisation.memberships m ON m.person_id=p.id
    JOIN organisation.organisations o ON o.id=m.organisation_id
    JOIN access.role_assignments ra ON ra.person_id=p.id AND ra.organisation_id=o.id
    JOIN access.roles r ON r.id=ra.role_id
    WHERE p.id=$1 AND o.id=$2 AND p.status='ACTIVE'
      AND o.organisation_type='SCHOOL' AND o.status='ACTIVE'
      AND m.membership_type='STAFF' AND m.status='ACTIVE'
      AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
      AND ra.status='ACTIVE' AND ra.starts_at<=now()
      AND (ra.ends_at IS NULL OR ra.ends_at>now())
    FOR SHARE OF p,m,o,ra`, [personId, schoolId]);
  if (!canPerformSchoolFinanceAction(result.rows.map(row => row.code), action))
    throw new AdminError("SCHOOL_FINANCE_PERMISSION_REQUIRED", 403);
}

/** Wrap checks and finance writes in the same transaction to avoid stale grants. */
export async function withSchoolFinancePermission<T>(
  pool: Pool,
  personId: string,
  schoolId: string,
  action: FinanceAction,
  operation: (db: PoolClient) => Promise<T>,
): Promise<T> {
  return transaction(pool, async db => {
    await assertSchoolFinancePermission(db, personId, schoolId, action);
    return operation(db);
  });
}
