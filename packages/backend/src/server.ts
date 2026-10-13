import { readFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import https from "node:https";
import { createApp } from "./app.js";
import { loadConfiguration } from "./config/environment.js";
import { createBackendLogger } from "./logging/backend-logger.js";

const configuration = loadConfiguration();
const logger = createBackendLogger(configuration.logLevel);
let ready = false;
const app = createApp(configuration, logger, () => ready);

const server: Server | https.Server = configuration.mutualTls
  ? https.createServer(
      {
        ca: readFileSync(configuration.mutualTls.caCertificatePath),
        cert: readFileSync(configuration.mutualTls.serverCertificatePath),
        key: readFileSync(configuration.mutualTls.serverKeyPath),
        minVersion: "TLSv1.2",
        rejectUnauthorized: true,
        requestCert: true,
      },
      app,
    )
  : createServer(app);

server.listen(configuration.port, () => {
  ready = true;
  logger.info({ event: "backend_listening", port: configuration.port });
});

registerGracefulShutdown(server, logger, () => {
  ready = false;
});

function registerGracefulShutdown(
  listeningServer: Server | https.Server,
  backendLogger: ReturnType<typeof createBackendLogger>,
  markNotReady: () => void,
): void {
  let shuttingDown = false;
  const shutdown = (signal: NodeJS.Signals): void => {
    if (shuttingDown) return;
    shuttingDown = true;
    markNotReady();
    backendLogger.info({ event: "backend_shutdown_started", signal });

    // Stop new connections, allow active requests to drain, then bound shutdown.
    const forceCloseTimer = setTimeout(() => {
      backendLogger.warn({ event: "backend_shutdown_forced", signal });
      listeningServer.closeAllConnections();
    }, 10_000);
    forceCloseTimer.unref();
    listeningServer.close((error) => {
      clearTimeout(forceCloseTimer);
      if (error) {
        backendLogger.error({ event: "backend_shutdown_failed", signal });
        process.exitCode = 1;
        return;
      }
      backendLogger.info({ event: "backend_shutdown_completed", signal });
    });
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}
