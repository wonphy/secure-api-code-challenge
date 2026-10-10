import type express from "express";
import type { BackendLogger } from "../logging/backend-logger.js";

export const notFoundHandler: express.RequestHandler = (
  _request: express.Request,
  response: express.Response,
): void => {
  response.status(404).json({ error: "not_found" });
};

export function createBackendErrorHandler(
  logger: BackendLogger,
): express.ErrorRequestHandler {
  return (
    error: unknown,
    _request: express.Request,
    response: express.Response,
    next: express.NextFunction,
  ): void => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof SyntaxError && "body" in error) {
      response.status(400).json({ error: "invalid_json" });
      return;
    }

    logger.error({
      event: "request_failed",
      method: _request.method,
      path: _request.originalUrl.split("?", 1)[0],
      sourceIp: _request.ip,
      statusCode: 500,
      errorCategory: "unexpected_error",
    });
    // Keep exception details in logs only; never disclose them in the API response.
    response.status(500).json({ error: "internal_server_error" });
  };
}
