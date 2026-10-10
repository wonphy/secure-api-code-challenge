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
        algorithms: configuration.algorithms,
        audience: configuration.audience,
        issuer: configuration.issuer,
        requiredClaims: ["exp"],
      });
      // `sub` is the stable OIDC identifier. Email is a verified fallback for
      // providers that include it in access tokens; no identity is asserted
      // when neither claim is usable.
      const userId = firstNonEmptyString(payload.sub, payload.email);
      if (!userId) {
        return undefined;
      }

      // Permissions inform backend authorization, but do not decide whether the
      // signed access token itself is authentic. Never log this claim.
      const permissions = isStringArray(payload.permissions)
        ? payload.permissions
        : [];

      return { userId, permissions };
    },
  };
}

function firstNonEmptyString(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return undefined;
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}
