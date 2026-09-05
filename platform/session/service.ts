import { createHash } from "node:crypto";
import type { Pool } from "pg";

export type IntrospectedSession = {
  sessionId: string;
  personId: string;
  issuedAt: string;
  expiresAt: string;
};

export function hashBearerToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function introspectBearerSession(
  pool: Pool,
  token: string,
  now = new Date(),
): Promise<IntrospectedSession | null> {
  const tokenHash = hashBearerToken(token);
  const result = await pool.query<{
    session_id: string;
    person_id: string;
    issued_at: Date;
    expires_at: Date;
  }>(
    `
      UPDATE session.sessions s
      SET last_used_at = $2
      FROM identity.accounts a, identity.persons p
      WHERE s.account_id = a.id
        AND p.id = a.person_id
        AND s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > $2
        AND a.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
      RETURNING s.id AS session_id, a.person_id, s.issued_at, s.expires_at
    `,
    [tokenHash, now],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    sessionId: row.session_id,
    personId: row.person_id,
    issuedAt: row.issued_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
  };
}

export async function revokeBearerSession(
  pool: Pool,
  token: string,
  now = new Date(),
): Promise<{ sessionId: string; personId: string } | null> {
  const result = await pool.query<{ session_id: string; person_id: string }>(
    `
      UPDATE session.sessions s
      SET revoked_at = $2
      FROM identity.accounts a
      WHERE s.account_id = a.id
        AND s.token_hash = $1
        AND s.revoked_at IS NULL
      RETURNING s.id AS session_id, a.person_id
    `,
    [hashBearerToken(token), now],
  );

  const row = result.rows[0];
  return row ? { sessionId: row.session_id, personId: row.person_id } : null;
}

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
