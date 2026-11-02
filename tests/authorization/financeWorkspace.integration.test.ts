import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Pool } from "pg";
import {
  listFinanceSchools,
  financeLearner,
  revokeFinanceStaff,
} from "../../domains/school-finance/directory";
import { assertSchoolFinancePermission } from "../../domains/school-finance/authorization";
import {
  createInvitation,
  acceptInvitation,
  previewInvitation,
  replaceInvitationLink,
} from "../../domains/school-admin/service";
test(
  "finance directory, exact learner lookup, principal-only invitations and revocation use current school authority",
  { skip: !process.env.CI || !process.env.DATABASE_URL, timeout: 60000 },
  async () => {
    const pool = new Pool({ connectionString: process.env.DATABASE_URL });
    const people = Array.from({ length: 6 }, () => randomUUID()),
      [principal, officer, admin, learner, recipient, outsider] = people,
      schools = [randomUUID(), randomUUID()],
      [schoolId, otherSchool] = schools;
    const old = process.env.PEOS_FINANCE_INVITATIONS_ENABLED;
    try {
      for (const id of people)
        await pool.query("INSERT INTO identity.persons(id) VALUES($1)", [id]);
      for (const id of schools)
        await pool.query(
          "INSERT INTO organisation.organisations(id,organisation_type,display_name) VALUES($1,'SCHOOL','Synthetic finance school')",
          [id],
        );
      for (const [id, school, role] of [
        [principal, schoolId, "PRINCIPAL"],
        [officer, schoolId, "FINANCE_OFFICER"],
        [admin, schoolId, "SCHOOL_ADMINISTRATOR"],
        [outsider, otherSchool, "FINANCE_MANAGER"],
      ]) {
        await pool.query(
          "INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'STAFF')",
          [id, school],
        );
        await pool.query(
          "INSERT INTO access.role_assignments(person_id,organisation_id,role_id) SELECT $1,$2,id FROM access.roles WHERE code=$3",
          [id, school, role],
        );
      }
      await pool.query(
        "INSERT INTO organisation.memberships(person_id,organisation_id,membership_type) VALUES($1,$2,'LEARNER')",
        [learner, schoolId],
      );
      await pool.query(
        "INSERT INTO identity.person_names(person_id,given_name,family_name) VALUES($1,'Synthetic','Learner')",
        [learner],
      );
      await pool.query(
        "INSERT INTO organisation.learner_registrations(school_id,learner_person_id,admission_number,created_by) VALUES($1,$2,'FIN-TEST',$3)",
        [schoolId, learner, principal],
      );
      const directory = await listFinanceSchools(pool, officer);
      assert.equal(directory.schools.length, 1);
      assert.equal(directory.schools[0].id, schoolId);
      assert.equal(
        directory.schools[0].actions.includes("finance.payments.verify"),
        false,
      );
      assert.equal((await listFinanceSchools(pool, admin)).schools.length, 0);
      assert.deepEqual(
        await financeLearner(pool, officer, schoolId, "FIN-TEST"),
        {
          personId: learner,
          admissionNumber: "FIN-TEST",
          givenName: "Synthetic",
          familyName: "Learner",
        },
      );
      for (const [person, school] of [
        [admin, schoolId],
        [outsider, schoolId],
        [officer, otherSchool],
      ])
        await assert.rejects(
          financeLearner(pool, person, school, "FIN-TEST"),
          /SCHOOL_FINANCE_FORBIDDEN/,
        );
      await pool.query(
        "UPDATE organisation.memberships SET status='ENDED' WHERE person_id=$1",
        [learner],
      );
      await assert.rejects(
        financeLearner(pool, officer, schoolId, "FIN-TEST"),
        /SCHOOL_FINANCE_FORBIDDEN/,
      );
      const invitation = {
        email: "synthetic-finance@example.test",
        roleCode: "FINANCE_OFFICER" as const,
      };
      delete process.env.PEOS_FINANCE_INVITATIONS_ENABLED;
      await assert.rejects(
        createInvitation(pool, principal, schoolId, invitation),
        /FINANCE_INVITATIONS_NOT_ENABLED/,
      );
      process.env.PEOS_FINANCE_INVITATIONS_ENABLED = "true";
      await assert.rejects(
        createInvitation(pool, admin, schoolId, invitation),
        /SCHOOL_PRINCIPAL_REQUIRED/,
      );
      const created = await createInvitation(
        pool,
        principal,
        schoolId,
        invitation,
      );
      await assert.rejects(
        replaceInvitationLink(pool, admin, schoolId, created.id),
        /SCHOOL_PRINCIPAL_REQUIRED/,
      );
      await assert.rejects(
        acceptInvitation(pool, principal, invitation.email, created.token),
        /INDEPENDENT_FINANCE_STAFF_REQUIRED/,
      );
      await assert.rejects(
        acceptInvitation(pool, recipient, "wrong@example.test", created.token),
        /INVITED_EMAIL_REQUIRED/,
      );
      await pool.query(
        "UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1",
        [principal],
      );
      await assert.rejects(
        previewInvitation(pool, created.token),
        /SCHOOL_ADMIN_REQUIRED/,
      );
      await assert.rejects(
        acceptInvitation(pool, recipient, invitation.email, created.token),
        /SCHOOL_ADMIN_REQUIRED/,
      );
      await pool.query(
        "UPDATE access.role_assignments SET status='ACTIVE' WHERE person_id=$1",
        [principal],
      );
      await acceptInvitation(pool, recipient, invitation.email, created.token);
      await assertSchoolFinancePermission(
        pool,
        recipient,
        schoolId,
        "finance.transactions.record",
      );
      await assert.rejects(
        assertSchoolFinancePermission(
          pool,
          recipient,
          schoolId,
          "finance.payments.verify",
        ),
        /SCHOOL_FINANCE_FORBIDDEN/,
      );
      await assert.rejects(
        revokeFinanceStaff(pool, admin, schoolId, created.id),
        /SCHOOL_PRINCIPAL_REQUIRED/,
      );
      // Removing principal authority must immediately block staff-management actions,
      // even for an invitation the same principal originally created.
      await pool.query(
        "UPDATE access.role_assignments SET status='ENDED' WHERE person_id=$1 AND organisation_id=$2",
        [principal, schoolId],
      );
      await assert.rejects(
        revokeFinanceStaff(pool, principal, schoolId, created.id),
        /SCHOOL_PRINCIPAL_REQUIRED/,
      );
      await pool.query(
        "UPDATE access.role_assignments SET status='ACTIVE' WHERE person_id=$1 AND organisation_id=$2",
        [principal, schoolId],
      );
      await revokeFinanceStaff(pool, principal, schoolId, created.id);
      // Revocation must immediately remove the school from the finance directory,
      // not merely deny a subsequent financial command.
      assert.equal((await listFinanceSchools(pool, recipient)).schools.length, 0);
      await assert.rejects(
        revokeFinanceStaff(pool, principal, schoolId, created.id),
        /FINANCE_STAFF_UNAVAILABLE/,
      );
      await assert.rejects(
        assertSchoolFinancePermission(
          pool,
          recipient,
          schoolId,
          "finance.transactions.read",
        ),
        /SCHOOL_FINANCE_FORBIDDEN/,
      );
      await pool.query(
        "UPDATE access.role_assignments SET ends_at=now()-interval '1 minute' WHERE person_id=$1",
        [officer],
      );
      assert.equal((await listFinanceSchools(pool, officer)).schools.length, 0);
      const audit = await pool.query(
        "SELECT metadata::text FROM audit.events WHERE action='finance.learner.lookup' AND actor_person_id=$1",
        [officer],
      );
      assert.equal(JSON.stringify(audit.rows).includes("FIN-TEST"), false);
      assert.equal(JSON.stringify(audit.rows).includes("Synthetic"), false);
    } finally {
      if (old === undefined)
        delete process.env.PEOS_FINANCE_INVITATIONS_ENABLED;
      else process.env.PEOS_FINANCE_INVITATIONS_ENABLED = old;
      await pool.query(
        "DELETE FROM organisation.staff_invitations WHERE school_id=ANY($1::uuid[])",
        [schools],
      );
      await pool.query(
        "DELETE FROM organisation.learner_registrations WHERE school_id=ANY($1::uuid[])",
        [schools],
      );
      await pool.query(
        "DELETE FROM identity.person_names WHERE person_id=ANY($1::uuid[])",
        [people],
      );
      await pool.query(
        "DELETE FROM access.role_assignments WHERE person_id=ANY($1::uuid[])",
        [people],
      );
      await pool.query(
        "DELETE FROM organisation.memberships WHERE organisation_id=ANY($1::uuid[])",
        [schools],
      );
      await pool.query(
        "DELETE FROM audit.events WHERE actor_person_id=ANY($1::uuid[])",
        [people],
      );
      await pool.query(
        "DELETE FROM organisation.organisations WHERE id=ANY($1::uuid[])",
        [schools],
      );
      await pool.query(
        "DELETE FROM identity.persons WHERE id=ANY($1::uuid[])",
        [people],
      );
      await pool.end();
    }
  },
);
