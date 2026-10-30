-- Finance roles are school-scoped and confer no access until an active STAFF
-- membership and matching active school role assignment are present.
INSERT INTO access.roles (code, name) VALUES
  ('FINANCE_OFFICER', 'School Finance Officer'),
  ('FINANCE_MANAGER', 'School Finance Manager')
ON CONFLICT (code) DO NOTHING;
