import type { Pool } from "pg";

export type LearnerContext = {
  personId: string;
  schoolId: string;
  classId?: string;
};

export async function getLearnerContext(
  pool: Pool,
  learnerPersonId: string,
  schoolId: string,
): Promise<LearnerContext | null> {
  const result = await pool.query<{ class_id: string }>(
    `
      SELECT c.id AS class_id
      FROM organisation.class_memberships cm
      JOIN organisation.classes c ON c.id = cm.class_id
      WHERE cm.learner_person_id = $1
        AND c.school_id = $2
        AND cm.status = 'ACTIVE'
        AND c.status = 'ACTIVE'
      LIMIT 1
    `,
    [learnerPersonId, schoolId],
  );

  const row = result.rows[0];
  if (!row) return null;
  return { personId: learnerPersonId, schoolId, classId: row.class_id };
}

export async function teacherCanAccessLearner(
  pool: Pool,
  teacherPersonId: string,
  learnerPersonId: string,
  schoolId: string,
): Promise<boolean> {
  const result = await pool.query(
    `
      SELECT 1
      FROM organisation.teacher_assignments ta
      JOIN organisation.class_memberships cm ON cm.class_id = ta.class_id
      WHERE ta.teacher_person_id = $1
        AND cm.learner_person_id = $2
        AND ta.school_id = $3
        AND ta.status = 'ACTIVE'
        AND cm.status = 'ACTIVE'
        AND (ta.ends_at IS NULL OR ta.ends_at > now())
      LIMIT 1
    `,
    [teacherPersonId, learnerPersonId, schoolId],
  );
  return (result.rowCount ?? 0) > 0;
}
