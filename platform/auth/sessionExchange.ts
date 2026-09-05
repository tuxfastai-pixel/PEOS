import { randomBytes } from "node:crypto";
import type { Pool } from "pg";

import { recordAuditEvent } from "../audit/service";
import { hashBearerToken, type IntrospectedSession } from "../session/service";
import type { ExternalIdentityVerifier } from "./oidcVerifier";

export type SessionExchangeResult = {
  accessToken: string;
  tokenType: "Bearer";
  session: IntrospectedSession;
};

export async function exchangeExternalIdentity(
  pool: Pool,
  verifier: ExternalIdentityVerifier,
  externalToken: string,
  sessionIssuer: string,
  ttlSeconds: number,
  now = new Date(),
): Promise<SessionExchangeResult | null> {
  const identity = await verifier.verify(externalToken);
  const resolved = await pool.query<{
    account_id: string;
    person_id: string;
  }>(
    `
      SELECT a.id AS account_id, a.person_id
      FROM identity.credential_identities ci
      JOIN identity.accounts a ON a.id = ci.account_id
      JOIN identity.persons p ON p.id = a.person_id
      WHERE ci.provider = $1
        AND ci.provider_subject = $2
        AND a.status = 'ACTIVE'
        AND p.status = 'ACTIVE'
      LIMIT 1
    `,
    [identity.provider, identity.subject],
  );

  const row = resolved.rows[0];
  if (!row) {
    await recordAuditEvent(pool, {
      action: "SESSION_EXCHANGE",
      resourceType: "CREDENTIAL_IDENTITY",
      decision: "DENY",
      reason: "credential_identity_not_provisioned",
      metadata: { provider: identity.provider },
    });
    return null;
  }

  const accessToken = randomBytes(32).toString("base64url");
  const issuedAt = new Date(now);
  const expiresAt = new Date(issuedAt.getTime() + ttlSeconds * 1000);

  const inserted = await pool.query<{ session_id: string }>(
    `
      INSERT INTO session.sessions(account_id, token_hash, issuer, issued_at, expires_at)
      VALUES ($1,$2,$3,$4,$5)
      RETURNING id AS session_id
    `,
    [row.account_id, hashBearerToken(accessToken), sessionIssuer, issuedAt, expiresAt],
  );

  const sessionId = inserted.rows[0]?.session_id;
  if (!sessionId) throw new Error("PEOS session insert returned no id");

  await recordAuditEvent(pool, {
    actorPersonId: row.person_id,
    action: "SESSION_EXCHANGE",
    resourceType: "SESSION",
    resourceId: sessionId,
    decision: "ALLOW",
    reason: "verified_external_identity",
    metadata: { provider: identity.provider, issuer: sessionIssuer },
  });

  return {
    accessToken,
    tokenType: "Bearer",
    session: {
      sessionId,
      personId: row.person_id,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    },
  };
}
