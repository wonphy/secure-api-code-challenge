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
