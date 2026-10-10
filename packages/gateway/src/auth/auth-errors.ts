import { errors } from "jose";
import type express from "express";

export function sendAuthenticationFailure(
  response: express.Response,
  error: unknown,
): void {
  // Return stable, safe client errors; detailed verifier diagnostics stay in debug logs.
  if (error instanceof errors.JWTExpired) {
    response.setHeader(
      "WWW-Authenticate",
      'Bearer error="invalid_token", error_description="The access token has expired"',
    );
    response.status(401).json({
      error: "token_expired",
      message: "The access token has expired. Obtain a new token and retry.",
    });
    return;
  }

  if (error instanceof errors.JWTClaimValidationFailed) {
    const claimErrors: Record<string, { error: string; message: string }> = {
      aud: {
        error: "invalid_token_audience",
        message: "The access token was not issued for this API.",
      },
      iss: {
        error: "invalid_token_issuer",
        message: "The access token issuer is not trusted.",
      },
      nbf: {
        error: "token_not_active",
        message: "The access token is not active yet.",
      },
    };
    const details = claimErrors[error.claim] ?? {
      error: "invalid_token_claims",
      message: "The access token claims are invalid.",
    };

    response.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
    response.status(401).json(details);
    return;
  }

  if (error instanceof errors.JWSInvalid) {
    response.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
    response.status(401).json({
      error: "unsupported_token_format",
      message: "The gateway requires a signed JWT access token.",
    });
    return;
  }

  if (
    error instanceof errors.JWKSTimeout ||
    error instanceof errors.JWKSInvalid
  ) {
    response.status(503).json({
      error: "identity_provider_unavailable",
      message: "Token verification is temporarily unavailable. Retry shortly.",
    });
    return;
  }

  response.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
  response.status(401).json({
    error: "invalid_token",
    message: "The access token could not be verified.",
  });
}
