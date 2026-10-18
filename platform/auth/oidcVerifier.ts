import { createRemoteJWKSet, jwtVerify } from "jose";

export type VerifiedExternalIdentity = {
  provider: string;
  subject: string;
  selfSignupAllowed?: boolean;
};

export interface ExternalIdentityVerifier {
  verify(token: string): Promise<VerifiedExternalIdentity>;
}

export class OidcIdentityVerifier implements ExternalIdentityVerifier {
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    private readonly issuer: string,
    private readonly audience: string,
    jwksUrl: string,
  ) {
    this.jwks = createRemoteJWKSet(new URL(jwksUrl));
  }

  async verify(token: string): Promise<VerifiedExternalIdentity> {
    const { payload } = await jwtVerify(token, this.jwks, {
      issuer: this.issuer,
      audience: this.audience,
      requiredClaims: ["sub", "exp", "iat"],
    });

    if (!payload.sub) {
      throw new Error("OIDC token is missing subject");
    }

    return {
      provider: this.issuer,
      subject: payload.sub,
      // Supabase's signed claims distinguish authenticated people from anonymous sessions.
      // User-editable profile metadata is never used to grant authority.
      selfSignupAllowed: payload.role === "authenticated" && payload.is_anonymous === false,
    };
  }
}
