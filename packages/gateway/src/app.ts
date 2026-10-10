import express from "express";
import { createAuthenticationMiddleware } from "./auth/auth-middleware.js";
import type { JwtVerifier } from "./auth/jwt-verifier.js";
import type { GatewayConfiguration } from "./config/environment.js";
import {
  createGatewayErrorHandler,
  notFoundHandler,
} from "./errors/http-errors.js";
import {
  createGatewayLogger,
  type GatewayLogger,
} from "./logging/gateway-logger.js";
import { createRequestLogger } from "./logging/request-logger.js";
import { createUsersProxy } from "./proxy/users-proxy.js";

export function createApp(
  configuration: GatewayConfiguration,
  verifier?: JwtVerifier,
  logger: GatewayLogger = createGatewayLogger(configuration.logLevel),
): express.Express {
  const app = express();

  app.use(createRequestLogger(logger));

  app.get("/health", (_request, response) => {
    response.status(200).json({ service: "gateway", status: "ok" });
  });

  // Authentication must run before the proxy can reach the protected backend API.
  app.use(
    "/api/users",
    createAuthenticationMiddleware({
      developmentToken: configuration.developmentToken,
      developmentUser: configuration.developmentUser,
      logger,
      verifier,
    }),
  );
  app.use(createUsersProxy(configuration.backendUrl, logger));
  app.use(notFoundHandler);
  app.use(createGatewayErrorHandler(logger));

  return app;
}
