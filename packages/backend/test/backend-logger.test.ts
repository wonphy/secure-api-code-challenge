import assert from "node:assert/strict";
import { test } from "node:test";
import { loadConfiguration } from "../src/config/environment.js";
import { createBackendLogger } from "../src/logging/backend-logger.js";

test("backend logger honours its configured minimum level", () => {
  const entries: string[] = [];
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;
  console.info = (message?: unknown): void => {
    entries.push(String(message));
  };
  console.warn = (message?: unknown): void => {
    entries.push(String(message));
  };
  console.error = (message?: unknown): void => {
    entries.push(String(message));
  };

  try {
    const logger = createBackendLogger("warn");
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

test("backend defaults to identity-only authorization and rejects an invalid mode", () => {
  assert.equal(loadConfiguration({}).authorizationMode, "identity-only");
  assert.throws(
    () => loadConfiguration({ AUTHORIZATION_MODE: "unknown" }),
    /AUTHORIZATION_MODE must be one of: identity-only, permissions/,
  );
});

test("backend requires certificate paths when mTLS mode is enabled", () => {
  const configuration = loadConfiguration({
    BACKEND_TLS_MODE: "mtls",
    TLS_CA_CERT_PATH: "/certs/ca.crt",
    TLS_SERVER_CERT_PATH: "/certs/backend.crt",
    TLS_SERVER_KEY_PATH: "/certs/backend.key",
  });
  assert.deepEqual(configuration.mutualTls, {
    caCertificatePath: "/certs/ca.crt",
    expectedClientCommonName: "gateway",
    serverCertificatePath: "/certs/backend.crt",
    serverKeyPath: "/certs/backend.key",
  });
  assert.throws(
    () => loadConfiguration({ BACKEND_TLS_MODE: "mtls" }),
    /TLS_CA_CERT_PATH is required when BACKEND_TLS_MODE=mtls/,
  );
});
