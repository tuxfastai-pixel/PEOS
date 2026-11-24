-- Complete the existing isolated Finance server-role strategy. No client/public
-- privilege, login, person role, family relationship or billing grant is created.
-- PEOS continues to enforce current person/school/action scope in its services.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='peos_finance_test_runtime') THEN
  GRANT SELECT,INSERT,UPDATE ON access.family_billing_grants TO peos_finance_test_runtime;
  CREATE POLICY finance_preview_billing_read ON access.family_billing_grants FOR SELECT TO peos_finance_test_runtime USING(true);
  CREATE POLICY finance_preview_billing_insert ON access.family_billing_grants FOR INSERT TO peos_finance_test_runtime WITH CHECK(true);
  CREATE POLICY finance_preview_billing_revoke ON access.family_billing_grants FOR UPDATE TO peos_finance_test_runtime USING(true) WITH CHECK(true);
  -- These tables already grant SELECT/INSERT/UPDATE to the trusted service role.
  -- Complete their policies too: billing creation locks them, and existing
  -- school invitation/confirmation/withdrawal services use these operations.
  CREATE POLICY finance_preview_family_invitation_read ON organisation.family_invitations FOR SELECT TO peos_finance_test_runtime USING(true);
  CREATE POLICY finance_preview_family_invitation_insert ON organisation.family_invitations FOR INSERT TO peos_finance_test_runtime WITH CHECK(true);
  CREATE POLICY finance_preview_family_invitation_update ON organisation.family_invitations FOR UPDATE TO peos_finance_test_runtime USING(true) WITH CHECK(true);
  CREATE POLICY finance_preview_family_relationship_read ON identity.school_family_relationships FOR SELECT TO peos_finance_test_runtime USING(true);
  CREATE POLICY finance_preview_family_relationship_insert ON identity.school_family_relationships FOR INSERT TO peos_finance_test_runtime WITH CHECK(true);
  CREATE POLICY finance_preview_family_relationship_update ON identity.school_family_relationships FOR UPDATE TO peos_finance_test_runtime USING(true) WITH CHECK(true);
 END IF;
END $$;
