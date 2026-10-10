import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, describe, it } from "node:test";
import express from "express";
import { createApp } from "../src/app.js";
import {
  createGatewayErrorHandler,
  notFoundHandler,
} from "../src/errors/http-errors.js";
import type { GatewayConfiguration } from "../src/config/environment.js";
import type { GatewayLogger } from "../src/logging/gateway-logger.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve, reject) =>
            server.close((error) => (error ? reject(error) : resolve())),
          ),
      ),
  );
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

function configuration(): GatewayConfiguration {
  return {
    backendUrl: "http://127.0.0.1:1",
    isDevelopment: false,
    logLevel: "info",
    port: 0,
  };
}

describe("gateway HTTP error responses", () => {
  it("returns a JSON 404 for an unknown route", async () => {
    const gateway = await listen(createServer(createApp(configuration())));

    const response = await fetch(`${gateway}/does-not-exist`);

    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: "not_found" });
  });

  it("returns safe JSON 400 and 500 responses without error details", async () => {
    const logEvents: Record<string, unknown>[] = [];
    const capture = (details: Record<string, unknown>): void => {
      logEvents.push(details);
    };
    const logger: GatewayLogger = {
      debug: capture,
      error: capture,
      info: capture,
      warn: capture,
    };
    const app = express();
    app.get("/bad-request", (_request, _response, next) => {
      next(Object.assign(new Error("invalid request body"), { status: 400 }));
    });
    app.get("/unexpected", (_request, _response, next) => {
      next(new Error("database connection string leaked here"));
    });
    app.use(notFoundHandler);
    app.use(createGatewayErrorHandler(logger));
    const server = await listen(createServer(app));

    const badRequest = await fetch(`${server}/bad-request`);
    const unexpected = await fetch(`${server}/unexpected`);
    const unexpectedBody = await unexpected.text();

    assert.equal(badRequest.status, 400);
    assert.deepEqual(await badRequest.json(), { error: "bad_request" });
    assert.equal(unexpected.status, 500);
    assert.deepEqual(JSON.parse(unexpectedBody), {
      error: "internal_server_error",
    });
    assert.doesNotMatch(unexpectedBody, /database connection string/);
    assert.equal(
      logEvents.some((event) => "errorMessage" in event),
      false,
    );
  });
});
