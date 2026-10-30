import type { Pool, PoolClient } from "pg";
import { canPerformSchoolFinanceAction, type FinanceAction, type SchoolFinanceRole } from "./permissions";

type Queryable = Pick<Pool | PoolClient, "query">;
const FINANCE_ROLES: readonly SchoolFinanceRole[] = [
  "PRINCIPAL", "SCHOOL_ADMINISTRATOR", "FINANCE_MANAGER", "FINANCE_OFFICER", "TEACHER", "PARENT",
];

/** Resolve roles from current database authority, never a UI role selector or JWT role claim. */
export async function activeSchoolFinanceRoles(db: Queryable, personId: string, schoolId: string): Promise<SchoolFinanceRole[]> {
  const result = await db.query<{ code: string }>(`
    SELECT DISTINCT r.code
    FROM identity.persons p
    JOIN organisation.memberships m ON m.person_id=p.id
    JOIN organisation.organisations o ON o.id=m.organisation_id
    JOIN access.role_assignments ra ON ra.person_id=p.id AND ra.organisation_id=o.id
    JOIN access.roles r ON r.id=ra.role_id
    WHERE p.id=$1 AND o.id=$2
      AND p.status='ACTIVE' AND o.status='ACTIVE' AND o.organisation_type='SCHOOL'
      AND m.membership_type='STAFF' AND m.status='ACTIVE'
      AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
      AND ra.status='ACTIVE' AND ra.starts_at<=now()
      AND (ra.ends_at IS NULL OR ra.ends_at>now())
  `, [personId, schoolId]);
  return result.rows.map(row => row.code).filter((role): role is SchoolFinanceRole =>
    FINANCE_ROLES.includes(role as SchoolFinanceRole));
}

export class FinanceAccessDenied extends Error {
  readonly code = "SCHOOL_FINANCE_FORBIDDEN";
  readonly status = 403;
  constructor() { super("SCHOOL_FINANCE_FORBIDDEN"); }
}

export async function assertSchoolFinancePermission(
  db: Queryable, personId: string, schoolId: string, action: FinanceAction,
): Promise<void> {
  const roles = await activeSchoolFinanceRoles(db, personId, schoolId);
  if (!canPerformSchoolFinanceAction(roles, action)) throw new FinanceAccessDenied();
}
