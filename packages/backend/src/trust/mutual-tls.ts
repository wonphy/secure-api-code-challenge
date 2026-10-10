import type express from "express";
import type { TLSSocket } from "node:tls";

/** Accepts assertions only from the expected mTLS-authenticated gateway peer. */
export function createMutualTlsGuard(
  expectedClientCommonName: string,
): express.RequestHandler {
  return (request, response, next): void => {
    const socket = request.socket as TLSSocket;
    if (typeof socket.getPeerCertificate !== "function") {
      response.status(403).json({ error: "trusted_gateway_required" });
      return;
    }
    const certificate = socket.getPeerCertificate();
    if (
      !socket.authorized ||
      certificate.subject?.CN !== expectedClientCommonName
    ) {
      response.status(403).json({ error: "trusted_gateway_required" });
      return;
    }

    next();
  };
}
