import type express from "express";
import type { GatewayLogger } from "../logging/gateway-logger.js";

export const notFoundHandler: express.RequestHandler = (_request, response) => {
  response.status(404).json({ error: "not_found" });
};

export function createGatewayErrorHandler(
  logger: GatewayLogger,
): express.ErrorRequestHandler {
  return (error: unknown, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    const statusCode = getClientErrorStatus(error);
    const details = {
      event: "request_failed",
      method: request.method,
      path: request.originalUrl.split("?", 1)[0],
      sourceIp: request.ip,
      userId: response.locals.verifiedUser,
      statusCode,
      errorCategory: statusCode === 400 ? "bad_request" : "unexpected_error",
    };

    if (statusCode === 400) {
      logger.warn(details);
    } else {
      logger.error(details);
    }

    if (statusCode === 400) {
      response.status(400).json({ error: "bad_request" });
      return;
    }

    response.status(500).json({ error: "internal_server_error" });
  };
}

function getClientErrorStatus(error: unknown): 400 | 500 {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 400
  ) {
    return 400;
  }

  return 500;
}
