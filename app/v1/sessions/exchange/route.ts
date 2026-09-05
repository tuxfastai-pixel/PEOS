import { exchangeExternalIdentity } from "../../../../platform/auth/sessionExchange";
import { OidcIdentityVerifier } from "../../../../platform/auth/oidcVerifier";
import { readServerEnvironment } from "../../../../platform/config/env";
import { getDatabasePool } from "../../../../platform/db/pool";
import { readBearerToken } from "../../../../platform/session/service";

function requireOidcConfiguration() {
  const env = readServerEnvironment();
  if (!env.OIDC_ISSUER || !env.OIDC_AUDIENCE || !env.OIDC_JWKS_URL) {
    throw new Error("PEOS OIDC authentication is not configured");
  }
  return env;
}

export async function POST(request: Request): Promise<Response> {
  const externalToken = readBearerToken(request);
  if (!externalToken) {
    return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const env = requireOidcConfiguration();
  const verifier = new OidcIdentityVerifier(env.OIDC_ISSUER, env.OIDC_AUDIENCE, env.OIDC_JWKS_URL);

  try {
    const result = await exchangeExternalIdentity(
      getDatabasePool(),
      verifier,
      externalToken,
      env.PEOS_SESSION_ISSUER,
      env.PEOS_SESSION_TTL_SECONDS,
    );

    if (!result) {
      return Response.json({ error: "IDENTITY_NOT_PROVISIONED" }, { status: 403 });
    }

    return Response.json(result, {
      status: 201,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    if (error instanceof Error && /JWT|JWKS|OIDC|signature|issuer|audience/i.test(error.message)) {
      return Response.json({ error: "UNAUTHENTICATED" }, { status: 401 });
    }
    throw error;
  }
}
