import type express from "express";
import type { AuthorizationMode } from "../config/environment.js";

function parsePermissions(
  header: string | undefined,
): ReadonlySet<string> | undefined {
  if (!header) {
    return undefined;
  }

  try {
    // The gateway serializes its verified permissions as a JSON string array.
    const value: unknown = JSON.parse(header);
    if (
      !Array.isArray(value) ||
      !value.every((permission) => typeof permission === "string")
    ) {
      return undefined;
    }

    return new Set(value);
  } catch {
    // Fail closed: an unusable gateway assertion grants no permissions.
    return undefined;
  }
}

/**
 * Applies optional route-level authorization after the verified-user guard.
 * The challenge's default mode accepts any gateway-verified identity; deployments
 * that configure a permissions claim can opt into fail-closed permission checks.
 */
export function requirePermission(
  mode: AuthorizationMode,
  permission: string,
): express.RequestHandler {
  if (mode === "identity-only") {
    return (_request, _response, next): void => next();
  }

  return (
    request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ): void => {
    const permissions = parsePermissions(
      request.header("x-verified-user-permissions"),
    );
    if (!permissions?.has(permission)) {
      response.status(403).json({ error: "insufficient_permissions" });
      return;
    }

    next();
  };
}
