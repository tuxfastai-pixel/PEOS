-- Defines a school-scoped finance role; does not assign it to any person.
INSERT INTO access.roles(code,name) VALUES('SCHOOL_FINANCE_OFFICER','School finance officer') ON CONFLICT(code) DO NOTHING;
ALTER TABLE organisation.staff_invitations DROP CONSTRAINT staff_invitations_role_code_check;
ALTER TABLE organisation.staff_invitations ADD CONSTRAINT staff_invitations_role_code_check CHECK(role_code IN ('TEACHER','SCHOOL_ADMINISTRATOR','SCHOOL_FINANCE_OFFICER'));
