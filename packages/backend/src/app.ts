import express from "express";
import {
  createBackendErrorHandler,
  notFoundHandler,
} from "./errors/http-errors.js";
import type { BackendConfiguration } from "./config/environment.js";
import {
  createBackendLogger,
  type BackendLogger,
} from "./logging/backend-logger.js";
import { createRequestLogger } from "./logging/request-logger.js";
import { createVerifiedUserGuard } from "./trust/verified-user.js";
import { createMutualTlsGuard } from "./trust/mutual-tls.js";
import { createUsersRouter } from "./users/users-router.js";

/** Creates the backend API with an isolated, in-memory user store. */
export function createApp(
  configuration: BackendConfiguration,
  logger: BackendLogger = createBackendLogger(configuration.logLevel),
): express.Express {
  const app = express();

  app.use(createRequestLogger(logger));
  app.use(express.json());

  app.get("/health", (_request, response) => {
    response.status(200).json({ service: "backend", status: "ok" });
  });

  // The backend consumes gateway assertions; it never validates bearer tokens itself.
  app.use(
    "/api/users",
    ...(configuration.mutualTls
      ? [createMutualTlsGuard(configuration.mutualTls.expectedClientCommonName)]
      : []),
    createVerifiedUserGuard(),
    createUsersRouter(configuration.authorizationMode),
  );
  app.use(notFoundHandler);
  app.use(createBackendErrorHandler(logger));

  return app;
}
