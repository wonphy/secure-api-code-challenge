import { createApp } from "./app.js";
import { createJwtVerifier } from "./auth/jwt-verifier.js";
import { loadConfiguration } from "./config/environment.js";

async function start(): Promise<void> {
  const configuration = loadConfiguration();
  const verifier = configuration.jwt
    ? createJwtVerifier(configuration.jwt)
    : undefined;

  if (verifier) {
    // Fail startup rather than accepting traffic that cannot validate access tokens.
    await verifier.preload();
    console.info(
      JSON.stringify({
        event: "jwks_preloaded",
        jwksUrl: configuration.jwt?.jwksUrl.toString(),
      }),
    );
  }

  const app = createApp(configuration, verifier);
  app.listen(configuration.port, () => {
    console.log(`Gateway listening on http://localhost:${configuration.port}`);
  });
}

void start().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : "unknown startup error";
  console.error(JSON.stringify({ event: "gateway_startup_failed", message }));
  process.exitCode = 1;
});
