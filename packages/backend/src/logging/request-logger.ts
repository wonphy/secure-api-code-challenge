import type express from "express";
import type { BackendLogger } from "./backend-logger.js";

export function createRequestLogger(
  logger: BackendLogger,
): express.RequestHandler {
  return (
    request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ): void => {
    const startedAt = Date.now();
    const path = request.originalUrl.split("?", 1)[0];

    response.on("finish", () => {
      const details = {
        event: "request_completed",
        method: request.method,
        path,
        sourceIp: request.ip,
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
