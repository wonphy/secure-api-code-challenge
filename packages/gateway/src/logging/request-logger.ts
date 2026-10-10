import type express from "express";
import type { GatewayLogger } from "./gateway-logger.js";

export function createRequestLogger(
  logger: GatewayLogger,
): express.RequestHandler {
  return (request, response, next) => {
    const startedAt = Date.now();
    const path = request.originalUrl.split("?", 1)[0];

    response.on("finish", () => {
      const details = {
        event: "request_completed",
        method: request.method,
        path,
        sourceIp: request.ip,
        userId: response.locals.verifiedUser,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      };

      if (response.statusCode >= 500) {
        logger.error(details);
      } else if (response.statusCode >= 400) {
        logger.warn(details);
      } else {
        logger.info(details);
      }
    });

    next();
  };
}
