-- No roles are granted by this migration. Finance invitations default to disabled.
ALTER TABLE organisation.staff_invitations DROP CONSTRAINT staff_invitations_role_code_check;
ALTER TABLE organisation.staff_invitations ADD CONSTRAINT staff_invitations_role_code_check CHECK(role_code IN ('TEACHER','SCHOOL_ADMINISTRATOR','FINANCE_MANAGER','FINANCE_OFFICER'));
