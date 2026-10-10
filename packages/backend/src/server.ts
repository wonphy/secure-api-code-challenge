import { createApp } from "./app.js";
import { loadConfiguration } from "./config/environment.js";
import { createBackendLogger } from "./logging/backend-logger.js";

const configuration = loadConfiguration();
const logger = createBackendLogger(configuration.logLevel);
const app = createApp(configuration, logger);

app.listen(configuration.port, () => {
  logger.info({ event: "backend_listening", port: configuration.port });
});
