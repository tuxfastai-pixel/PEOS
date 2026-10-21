CREATE TABLE IF NOT EXISTS organisation.staff_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id uuid NOT NULL REFERENCES organisation.organisations(id),
  email text NOT NULL CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
  role_code text NOT NULL REFERENCES access.roles(code) CHECK (role_code IN ('TEACHER','SCHOOL_ADMINISTRATOR')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid NOT NULL REFERENCES identity.persons(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL CHECK (expires_at > created_at),
  accepted_at timestamptz,
  accepted_by uuid REFERENCES identity.persons(id),
  revoked_at timestamptz,
  CHECK ((accepted_at IS NULL) = (accepted_by IS NULL)),
  CHECK (accepted_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX IF NOT EXISTS staff_invitations_school_created_idx
  ON organisation.staff_invitations(school_id, created_at DESC);
CREATE INDEX IF NOT EXISTS staff_invitations_pending_email_idx
  ON organisation.staff_invitations(school_id, email) WHERE accepted_at IS NULL AND revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS staff_invitations_created_by_idx ON organisation.staff_invitations(created_by);
CREATE INDEX IF NOT EXISTS staff_invitations_accepted_by_idx ON organisation.staff_invitations(accepted_by);
ALTER TABLE organisation.staff_invitations ENABLE ROW LEVEL SECURITY;
