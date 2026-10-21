ALTER TABLE session.sessions
  ADD COLUMN IF NOT EXISTS last_used_at timestamptz;

CREATE INDEX IF NOT EXISTS sessions_active_expiry_idx
  ON session.sessions(expires_at)
  WHERE revoked_at IS NULL;
