import type express from "express";

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

/** Requires a permission asserted by the gateway in X-Verified-User-Permissions. */
export function requirePermission(permission: string): express.RequestHandler {
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
