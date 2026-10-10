import { decodeProtectedHeader } from "jose";
import type express from "express";

export function debugAuthentication(
  logLevel: string,
  request: express.Request,
  event: string,
  token?: string,
  error?: unknown,
): void {
  if (logLevel !== "debug") return;

  const details: Record<string, string | number | undefined> = {
    event,
    method: request.method,
    path: request.path,
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
    details.errorName = error.name;
    details.errorMessage = error.message;
  }

  console.info(JSON.stringify(details));
}
