import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfiguration } from "../src/config/environment.js";
import { createGatewayLogger } from "../src/logging/gateway-logger.js";

test("gateway logger honours its configured minimum level", () => {
  const entries: string[] = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.info = (message?: unknown) => entries.push(String(message));
  console.warn = (message?: unknown) => entries.push(String(message));
  console.error = (message?: unknown) => entries.push(String(message));

  try {
    const logger = createGatewayLogger("warn");
    logger.debug({ event: "debug_event" });
    logger.info({ event: "info_event" });
    logger.warn({ event: "warning_event" });
    logger.error({ event: "error_event" });
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  }

  assert.equal(entries.length, 2);
  const [warning, error] = entries.map(
    (entry) => JSON.parse(entry) as Record<string, unknown>,
  );
  assert.equal(warning.event, "warning_event");
  assert.equal(warning.level, "warn");
  assert.equal(error.event, "error_event");
  assert.equal(error.level, "error");
  assert.equal(typeof warning.timestamp, "string");
  assert.equal(typeof error.timestamp, "string");
});

test("gateway rejects unsupported log levels at startup", () => {
  assert.throws(
    () =>
      loadConfiguration({
        LOG_LEVEL: "verbose",
        NODE_ENV: "development",
      }),
    /LOG_LEVEL must be one of: debug, info, warn, error/,
  );
});

test("gateway validates production network and JWT algorithm configuration", () => {
  const productionEnvironment = {
    BACKEND_ALLOWED_HOSTS: "users-api.internal.example",
    BACKEND_URL: "http://users-api.internal.example:3001",
    JWT_AUDIENCE: "secure-api",
    JWT_ISSUER: "https://issuer.example.test/",
    JWT_JWKS_URL: "https://issuer.example.test/.well-known/jwks.json",
    NODE_ENV: "production",
  };

  const configuration = loadConfiguration(productionEnvironment);
  assert.deepEqual(configuration.jwt?.algorithms, ["RS256"]);

  assert.throws(
    () =>
      loadConfiguration({
        ...productionEnvironment,
        JWT_JWKS_URL: "http://issuer.example.test/.well-known/jwks.json",
      }),
    /JWT_JWKS_URL must use HTTPS outside development mode/,
  );
  assert.throws(
    () =>
      loadConfiguration({
        ...productionEnvironment,
        BACKEND_URL: "http://unapproved.example.test:3001",
      }),
    /BACKEND_URL hostname is not in BACKEND_ALLOWED_HOSTS/,
  );
  assert.throws(
    () =>
      loadConfiguration({
        ...productionEnvironment,
        BACKEND_ALLOWED_HOSTS: "",
      }),
    /BACKEND_ALLOWED_HOSTS must name the approved backend hostname/,
  );
  assert.throws(
    () =>
      loadConfiguration({
        ...productionEnvironment,
        BACKEND_URL: "http://service-user:secret@users-api.internal.example",
      }),
    /BACKEND_URL must not contain credentials/,
  );
  assert.throws(
    () =>
      loadConfiguration({
        ...productionEnvironment,
        JWT_ALLOWED_ALGORITHMS: "HS256",
      }),
    /JWT_ALLOWED_ALGORITHMS must contain only/,
  );
});

test("gateway requires complete mTLS configuration for an HTTPS backend", () => {
  const configuration = loadConfiguration({
    BACKEND_TLS_MODE: "mtls",
    BACKEND_URL: "https://backend.example.test:3001",
    NODE_ENV: "development",
    TLS_CA_CERT_PATH: "/certs/ca.crt",
    TLS_CLIENT_CERT_PATH: "/certs/gateway.crt",
    TLS_CLIENT_KEY_PATH: "/certs/gateway.key",
  });

  assert.deepEqual(configuration.backendMutualTls, {
    caCertificatePath: "/certs/ca.crt",
    clientCertificatePath: "/certs/gateway.crt",
    clientKeyPath: "/certs/gateway.key",
  });
  assert.throws(
    () =>
      loadConfiguration({
        BACKEND_TLS_MODE: "mtls",
        BACKEND_URL: "http://backend.example.test:3001",
        NODE_ENV: "development",
      }),
    /BACKEND_URL must use HTTPS when BACKEND_TLS_MODE=mtls/,
  );
});
