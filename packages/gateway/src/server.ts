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

  const app = createApp(configuration, verifier, logger);
  app.listen(configuration.port, () => {
    logger.info({
      event: "gateway_listening",
      port: configuration.port,
    });
  });
}

void start().catch(() => {
  createGatewayLogger("error").error({
    event: "gateway_startup_failed",
    errorCategory: "startup_failure",
  });
  process.exitCode = 1;
});
