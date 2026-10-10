import type express from "express";
import { debugAuthentication } from "./auth-debug.js";
import { sendAuthenticationFailure } from "./auth-errors.js";
import type { JwtVerifier } from "./jwt-verifier.js";

interface AuthenticationOptions {
  developmentToken?: string;
  developmentUser?: string;
  logLevel: string;
  verifier?: JwtVerifier;
}

export function createAuthenticationMiddleware({
  developmentToken,
  developmentUser,
  logLevel,
  verifier,
}: AuthenticationOptions): express.RequestHandler {
  return async (request, response, next) => {
    const token = request.header("authorization")?.replace(/^Bearer\s+/i, "");

    if (!token) {
      debugAuthentication(logLevel, request, "authentication_missing_token");
      response.status(401).json({ error: "missing bearer token" });
      return;
    }

    let verifiedUser: string | undefined;

    try {
      if (verifier) {
        verifiedUser = await verifier.verify(token);
      } else if (!developmentToken || token !== developmentToken) {
        debugAuthentication(
          logLevel,
          request,
          "authentication_not_configured",
          token,
        );
        response
          .status(503)
          .json({ error: "gateway authentication is not configured" });
        return;
      } else {
        verifiedUser = developmentUser;
      }
    } catch (error) {
      debugAuthentication(
        logLevel,
        request,
        "authentication_invalid_token",
        token,
        error,
      );
      sendAuthenticationFailure(response, error);
      return;
    }

    if (!verifiedUser) {
      response.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
      response.status(401).json({
        error: "token_identity_missing",
        message: "The access token does not contain a verified user identity.",
      });
      return;
    }

    // Preserve the trusted identity until the proxy injects it at the backend boundary.
    response.locals.verifiedUser = verifiedUser;
    next();
  };
}
