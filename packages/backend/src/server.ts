import { createApp } from "./app.js";
import { loadConfiguration } from "./config/environment.js";
import { createBackendLogger } from "./logging/backend-logger.js";

const configuration = loadConfiguration();
const logger = createBackendLogger(configuration.logLevel);
const app = createApp(configuration, logger);

const server = configuration.mutualTls
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
  : app;

server.listen(configuration.port, () => {
  logger.info({ event: "backend_listening", port: configuration.port });
});
import { readFileSync } from "node:fs";
import https from "node:https";
