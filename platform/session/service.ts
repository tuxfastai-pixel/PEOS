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
      SELECT s.id AS session_id, a.person_id, s.issued_at, s.expires_at
      FROM session.sessions s
      JOIN identity.accounts a ON a.id = s.account_id
      JOIN identity.persons p ON p.id = a.person_id
      WHERE s.token_hash = $1
        AND s.revoked_at IS NULL
        AND s.expires_at > $2
        AND a.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
      LIMIT 1
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

export function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
