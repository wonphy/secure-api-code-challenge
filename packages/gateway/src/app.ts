import express from "express";
import { createAuthenticationMiddleware } from "./auth/auth-middleware.js";
import type { JwtVerifier } from "./auth/jwt-verifier.js";
import type { GatewayConfiguration } from "./config/environment.js";
import { createUsersProxy } from "./proxy/users-proxy.js";

export function createApp(
  configuration: GatewayConfiguration,
  verifier?: JwtVerifier,
): express.Express {
  const app = express();

  app.get("/health", (_request, response) => {
    response.status(200).json({ service: "gateway", status: "ok" });
  });

  // Authentication must run before the proxy can reach the protected backend API.
  app.use(
    "/api/users",
    createAuthenticationMiddleware({
      developmentToken: configuration.developmentToken,
      developmentUser: configuration.developmentUser,
      logLevel: configuration.logLevel,
      verifier,
    }),
  );
  app.use(createUsersProxy(configuration.backendUrl));

  return app;
}
