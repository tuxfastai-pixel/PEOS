import { createRemoteJWKSet, jwtVerify } from "jose";

export type VerifiedExternalIdentity = {
  provider: string;
  subject: string;
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
    });

    if (!payload.sub) {
      throw new Error("OIDC token is missing subject");
    }

    return {
      provider: this.issuer,
      subject: payload.sub,
    };
  }
}
