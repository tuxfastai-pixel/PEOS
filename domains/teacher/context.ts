import type { Pool } from "pg";

export type TeacherContext = {
  personId: string;
  schoolId: string;
  roleIds: string[];
  classIds: string[];
  active: boolean;
};

export async function getTeacherContext(pool: Pool, personId: string): Promise<TeacherContext | null> {
  const membership = await pool.query<{ school_id: string }>(
    `
      SELECT organisation_id AS school_id
      FROM organisation.memberships
      WHERE person_id = $1
        AND membership_type = 'STAFF'
        AND status = 'ACTIVE'
        AND (ends_at IS NULL OR ends_at > now())
      ORDER BY starts_at DESC
      LIMIT 1
    `,
    [personId],
  );

  const schoolId = membership.rows[0]?.school_id;
  if (!schoolId) return null;

  const roles = await pool.query<{ role_id: string }>(
    `
      SELECT ra.role_id
      FROM access.role_assignments ra
      WHERE ra.person_id = $1
        AND ra.organisation_id = $2
        AND ra.status = 'ACTIVE'
        AND (ra.ends_at IS NULL OR ra.ends_at > now())
    `,
    [personId, schoolId],
  );

  if (roles.rows.length === 0) return null;

  const classes = await pool.query<{ class_id: string | null }>(
    `
      SELECT class_id
      FROM organisation.teacher_assignments
      WHERE teacher_person_id = $1
        AND school_id = $2
        AND status = 'ACTIVE'
        AND (ends_at IS NULL OR ends_at > now())
    `,
    [personId, schoolId],
  );

  return {
    personId,
    schoolId,
    roleIds: roles.rows.map((row) => row.role_id),
    classIds: classes.rows.flatMap((row) => (row.class_id ? [row.class_id] : [])),
    active: true,
  };
}
