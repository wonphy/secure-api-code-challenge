import { decodeProtectedHeader } from "jose";
import type express from "express";
import { sendAuthenticationFailure } from "./auth-errors.js";
import type { JwtVerifier, VerifiedIdentity } from "./jwt-verifier.js";
import type { GatewayLogger } from "../logging/gateway-logger.js";

interface AuthenticationOptions {
  developmentToken?: string;
  developmentUser?: string;
  logger: GatewayLogger;
  verifier?: JwtVerifier;
}

export function createAuthenticationMiddleware({
  developmentToken,
  developmentUser,
  logger,
  verifier,
}: AuthenticationOptions): express.RequestHandler {
  return async (
    request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ) => {
    const token = request
      .header("authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1];

    if (!token) {
      debugAuthentication(logger, request, "authentication_missing_token");
      response.status(401).json({ error: "missing bearer token" });
      return;
    }

    let verifiedIdentity: VerifiedIdentity | undefined;

    try {
      if (verifier) {
        verifiedIdentity = await verifier.verify(token);
      } else if (!developmentToken || token !== developmentToken) {
        debugAuthentication(
          logger,
          request,
          "authentication_not_configured",
          token,
        );
        response
          .status(503)
          .json({ error: "gateway authentication is not configured" });
        return;
      } else {
        verifiedIdentity = developmentUser
          ? { userId: developmentUser, permissions: [] }
          : undefined;
      }
    } catch (error) {
      debugAuthentication(
        logger,
        request,
        "authentication_invalid_token",
        token,
        error,
      );
      sendAuthenticationFailure(response, error);
      return;
    }

    if (!verifiedIdentity) {
      debugAuthentication(
        logger,
        request,
        "authentication_identity_missing",
        token,
      );
      response.setHeader("WWW-Authenticate", 'Bearer error="invalid_token"');
      response.status(401).json({
        error: "token_identity_missing",
        message: "The access token does not contain a verified user identity.",
      });
      return;
    }

    // Preserve gateway-verified assertions until the proxy injects them at the backend boundary.
    response.locals.verifiedUser = verifiedIdentity.userId;
    response.locals.verifiedUserPermissions = verifiedIdentity.permissions;
    next();
  };
}

function debugAuthentication(
  logger: GatewayLogger,
  request: express.Request,
  event: string,
  token?: string,
  error?: unknown,
): void {
  const details: Record<string, string | number | undefined> = {
    event,
    method: request.method,
    path: request.originalUrl.split("?", 1)[0],
    sourceIp: request.ip,
  };

  if (token) {
    // Log token shape and protected-header metadata, never the bearer token or claims.
    details.tokenSegments = token.split(".").length;

    try {
      const protectedHeader = decodeProtectedHeader(token);
      details.tokenAlgorithm = protectedHeader.alg;
      details.tokenEncryption = protectedHeader.enc;
    } catch {
      details.tokenHeader = "unreadable";
    }
  }

  if (error instanceof Error) {
    details.errorCategory = error.name;
  }

  logger.debug(details);
}
