# School class administration

School-scoped administrators can GET/POST /v1/admin/schools/[schoolId]/classes to list classes, eligible teachers and assignments or create a named class for an academic year. POST /classes/[classId]/teachers takes only teacherPersonId. DELETE /classes/[classId]/teachers/[teacherPersonId] ends the assignment. Input schemas are strict and IDs are UUIDs. The directory is bounded to 200 classes and 200 teachers.

Current administrator authority is checked in each transaction. Assignment requires same-school active class, active person, current staff membership and current TEACHER role. Advisory locks serialize duplicate creation and assignment/removal; class and authority rows are locked while changes occur. Assignment is idempotent. No identity, learner, class-membership, subscription, consent or product learning records are created. Reads and mutations are audited. No schema migration is needed: existing canonical class/assignment tables are used.

Teacher context now requires TEACHER role and active person and returns classes=[{id,name,academicYear}] alongside classIds. Queries exclude cross-school and inactive classroom rows. Removal and membership/role ending are evaluated on subsequent reads. Accepted invitation emails are administrator-only display labels; role/membership—not email—decides eligibility.

Tests run against isolated CI PostgreSQL and include scope, lifetime, duplicate/concurrent operations, corruption boundaries and immediate learner-authority loss after removal. Production classes must be entered by the school administrator; rollout does not create example records.
