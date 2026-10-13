import type express from "express";

/**
 * Applies headers that are safe for every gateway response, including health
 * checks and errors. TLS-only policies such as HSTS remain an ingress concern:
 * the local gateway intentionally also supports plain HTTP.
 */
export const applyGatewayResponseHeaders: express.RequestHandler = (
  _request,
  response,
  next,
): void => {
  response.setHeader("Cross-Origin-Resource-Policy", "same-origin");
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("X-Frame-Options", "DENY");
  next();
};

/**
 * User API responses can contain email addresses. Apply this before
 * authentication so failed requests are also never retained by browser or
 * shared HTTP caches.
 */
export const applySensitiveApiCachePolicy: express.RequestHandler = (
  _request,
  response,
  next,
): void => {
  response.setHeader("Cache-Control", "no-store");
  next();
};
