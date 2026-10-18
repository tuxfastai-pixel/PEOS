import { z } from "zod";
import type { Pool } from "pg";
import { OidcIdentityVerifier, type ExternalIdentityVerifier } from "../../platform/auth/oidcVerifier";
import { readServerEnvironment } from "../../platform/config/env";
import { AdminError } from "./service";

export async function verifiedRecipient(
  pool: Pool, personId: string, externalToken: string,
  config: { issuer: string; audience: string; jwksUrl: string; publishableKey: string },
  fetchImpl: typeof fetch = fetch,
  verifier: ExternalIdentityVerifier = new OidcIdentityVerifier(config.issuer, config.audience, config.jwksUrl),
) {
  try {
    const identity = await verifier.verify(externalToken);
    const response = await fetchImpl(`${config.issuer}/user`, {
      headers: { authorization: `Bearer ${externalToken}`, apikey: config.publishableKey },
      cache: "no-store", signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Identity could not be confirmed");
    const user = z.object({ id: z.string(), email: z.string().email(), email_confirmed_at: z.string().min(1), is_anonymous: z.literal(false) }).parse(await response.json());
    if (user.id !== identity.subject) throw new Error("Identity mismatch");
    const binding = await pool.query(`SELECT ci.id FROM identity.credential_identities ci JOIN identity.accounts a ON a.id=ci.account_id
      JOIN identity.persons p ON p.id=a.person_id WHERE ci.provider=$1 AND ci.provider_subject=$2 AND a.person_id=$3
      AND a.status='ACTIVE' AND p.status='ACTIVE'`, [identity.provider, identity.subject, personId]);
    if (!binding.rows.length) throw new Error("Identity mismatch");
    return user.email.toLowerCase();
  } catch { throw new AdminError("VERIFIED_RECIPIENT_REQUIRED", 401); }
}

export function recipientConfiguration() {
  const env = readServerEnvironment();
  if (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE || !env.OIDC_JWKS_URL || !env.SUPABASE_PUBLISHABLE_KEY) throw new AdminError("INVITATIONS_NOT_CONFIGURED", 503);
  return { issuer: env.OIDC_ISSUER, audience: env.OIDC_AUDIENCE, jwksUrl: env.OIDC_JWKS_URL, publishableKey: env.SUPABASE_PUBLISHABLE_KEY };
}
