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
  teacherPersonId: string,
): Promise<LearnerContext | null> {
  const result = await pool.query<{ class_id: string }>(
    `
      SELECT c.id AS class_id
      FROM organisation.class_memberships cm
      JOIN organisation.classes c ON c.id = cm.class_id
      JOIN organisation.organisations o ON o.id = c.school_id
      JOIN identity.persons p ON p.id=cm.learner_person_id AND p.status='ACTIVE'
      JOIN organisation.teacher_assignments ta ON ta.class_id=c.id AND ta.school_id=c.school_id
        AND ta.teacher_person_id=$3 AND ta.status='ACTIVE' AND ta.starts_at<=now() AND (ta.ends_at IS NULL OR ta.ends_at>now())
      WHERE cm.learner_person_id = $1
        AND c.school_id = $2
        AND cm.status = 'ACTIVE'
        AND c.status = 'ACTIVE'
        AND o.organisation_type = 'SCHOOL'
        AND o.status = 'ACTIVE'
      ORDER BY c.academic_year DESC NULLS LAST,c.name,c.id
      LIMIT 1
    `,
    [learnerPersonId, schoolId, teacherPersonId],
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
      JOIN organisation.classes c ON c.id = ta.class_id
      JOIN organisation.class_memberships cm ON cm.class_id = ta.class_id
      JOIN identity.persons learner ON learner.id=cm.learner_person_id AND learner.status='ACTIVE'
      JOIN organisation.memberships lm ON lm.person_id=learner.id AND lm.organisation_id=c.school_id AND lm.membership_type='LEARNER'
        AND lm.status='ACTIVE' AND lm.starts_at<=now() AND (lm.ends_at IS NULL OR lm.ends_at>now())
      JOIN identity.persons teacher ON teacher.id=ta.teacher_person_id AND teacher.status='ACTIVE'
      JOIN organisation.organisations school ON school.id=c.school_id AND school.status='ACTIVE' AND school.organisation_type='SCHOOL'
      JOIN organisation.memberships m ON m.person_id=teacher.id AND m.organisation_id=school.id
        AND m.membership_type='STAFF' AND m.status='ACTIVE' AND m.starts_at<=now() AND (m.ends_at IS NULL OR m.ends_at>now())
      JOIN access.role_assignments ra ON ra.person_id=teacher.id AND ra.organisation_id=school.id
        AND ra.status='ACTIVE' AND ra.starts_at<=now() AND (ra.ends_at IS NULL OR ra.ends_at>now())
      JOIN access.roles r ON r.id=ra.role_id AND r.code='TEACHER'
      WHERE ta.teacher_person_id = $1
        AND cm.learner_person_id = $2
        AND ta.school_id = $3
        AND c.school_id = $3
        AND ta.status = 'ACTIVE'
        AND ta.starts_at <= now()
        AND cm.status = 'ACTIVE'
        AND c.status = 'ACTIVE'
        AND (ta.ends_at IS NULL OR ta.ends_at > now())
      LIMIT 1
    `,
    [teacherPersonId, learnerPersonId, schoolId],
  );
  return (result.rowCount ?? 0) > 0;
}
