import { createRemoteJWKSet, jwtVerify } from "jose";
import type { JwtConfiguration } from "../config/environment.js";

export interface VerifiedIdentity {
  userId: string;
  permissions: string[];
}

export interface JwtVerifier {
  preload(): Promise<void>;
  verify(token: string): Promise<VerifiedIdentity | undefined>;
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
        requiredClaims: ["exp"],
      });
      if (!payload.sub) {
        return undefined;
      }

      // Permissions inform backend authorization, but do not decide whether the
      // signed access token itself is authentic. Never log this claim.
      const permissions = isStringArray(payload.permissions)
        ? payload.permissions
        : [];

      return { userId: payload.sub, permissions };
    },
  };
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
