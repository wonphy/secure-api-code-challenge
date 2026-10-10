import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JwtConfiguration } from "../config/environment.js";

export interface JwtVerifier {
  preload(): Promise<void>;
  verify(token: string): Promise<string | undefined>;
}

export function createJwtVerifier(
  configuration: JwtConfiguration,
): JwtVerifier {
  // jose owns the JWKS cache and refreshes it when signing keys rotate or change.
  const jwks = createRemoteJWKSet(configuration.jwksUrl);

  return {
    preload: async () => jwks.reload(),
    verify: async (token) => {
      const { payload } = await jwtVerify(token, jwks, {
        audience: configuration.audience,
        issuer: configuration.issuer,
      });
      return payload.sub;
    },
  };
}
