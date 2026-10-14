import type express from "express";
import { VERIFIED_USER_HEADER } from "@secure-api/contracts/gateway-assertions";

/**
 * Accepts only the identity assertion injected by the gateway.
 * JWT validation deliberately belongs to the gateway, not this backend.
 */
export function createVerifiedUserGuard(): express.RequestHandler {
  return (request, response, next) => {
    const verifiedUser = request.header(VERIFIED_USER_HEADER);
    if (!verifiedUser) {
      response.status(403).json({ error: "verified_user_required" });
      return;
    }

    next();
  };
}
