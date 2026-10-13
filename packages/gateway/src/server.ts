import type { Server } from "node:http";
import { createApp } from "./app.js";
import { createJwtVerifier } from "./auth/jwt-verifier.js";
import { loadConfiguration } from "./config/environment.js";
import { createGatewayLogger } from "./logging/gateway-logger.js";

async function start(): Promise<void> {
  const configuration = loadConfiguration();
  const logger = createGatewayLogger(configuration.logLevel);
  const verifier = configuration.jwt
    ? createJwtVerifier(configuration.jwt)
    : undefined;

  if (verifier) {
    // Fail startup rather than accepting traffic that cannot validate access tokens.
    await verifier.preload();
    logger.info({
      event: "jwks_preloaded",
      jwksUrl: configuration.jwt?.jwksUrl.toString(),
    });
  }

  let ready = false;
  const app = createApp(configuration, verifier, logger, () => ready);
  const server = app.listen(configuration.port, () => {
    ready = true;
    logger.info({
      event: "gateway_listening",
      port: configuration.port,
    });
  });

  registerGracefulShutdown(server, logger, () => {
    ready = false;
  });
}

function registerGracefulShutdown(
  server: Server,
  logger: ReturnType<typeof createGatewayLogger>,
  markNotReady: () => void,
): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    markNotReady();
    logger.info({ event: "gateway_shutdown_started", signal });

    // Stop new connections, allow active requests to drain, then bound shutdown.
    const forceCloseTimer = setTimeout(() => {
      logger.warn({ event: "gateway_shutdown_forced", signal });
      server.closeAllConnections();
    }, 10_000);
    forceCloseTimer.unref();
    server.close((error) => {
      clearTimeout(forceCloseTimer);
      if (error) {
        logger.error({ event: "gateway_shutdown_failed", signal });
        process.exitCode = 1;
        return;
      }
      logger.info({ event: "gateway_shutdown_completed", signal });
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

void start().catch(() => {
  createGatewayLogger("error").error({
    event: "gateway_startup_failed",
    errorCategory: "startup_failure",
  });
  process.exitCode = 1;
});
