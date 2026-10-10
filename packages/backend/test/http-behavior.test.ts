import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, describe, it } from "node:test";
import express from "express";
import { createApp } from "../src/app.js";
import type { BackendConfiguration } from "../src/config/environment.js";
import { createBackendErrorHandler } from "../src/errors/http-errors.js";
import type { BackendLogger } from "../src/logging/backend-logger.js";

const servers: Server[] = [];
const configuration: BackendConfiguration = { logLevel: "error", port: 0 };

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

describe("backend HTTP behavior", () => {
  it("keeps health public and returns JSON for unknown routes", async () => {
    const backend = await listen(createServer(createApp(configuration)));

    const health = await fetch(`${backend}/health`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { service: "backend", status: "ok" });

    const missing = await fetch(`${backend}/does-not-exist`);
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: "not_found" });
  });

  it("returns a safe 400 for malformed JSON", async () => {
    const backend = await listen(createServer(createApp(configuration)));

    const response = await fetch(`${backend}/api/users`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-verified-user": "gateway-verified-user",
        "x-verified-user-permissions": JSON.stringify(["create:user"]),
      },
      body: "{",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), { error: "invalid_json" });
  });

  it("does not log user data or query values", async () => {
    const loggedEvents: Record<string, unknown>[] = [];
    const capture = (details: Record<string, unknown>): void => {
      loggedEvents.push(details);
    };
    const logger: BackendLogger = {
      debug: capture,
      error: capture,
      info: capture,
      warn: capture,
    };
    const backend = await listen(
      createServer(createApp(configuration, logger)),
    );

    const response = await fetch(`${backend}/api/users?trace=do-not-log`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-verified-user": "ada@example.test",
        "x-verified-user-permissions": JSON.stringify(["create:user"]),
      },
      body: JSON.stringify({ name: "Ada Lovelace", email: "ada@example.test" }),
    });
    await response.text();

    assert.equal(response.status, 201);
    assert.equal(loggedEvents.length, 1);
    const logOutput = JSON.stringify(loggedEvents);
    assert.equal(logOutput.includes("Ada Lovelace"), false);
    assert.equal(logOutput.includes("ada@example.test"), false);
    assert.equal(logOutput.includes("do-not-log"), false);
  });

  it("does not expose unexpected error details", async () => {
    const loggedEvents: Record<string, unknown>[] = [];
    const capture = (details: Record<string, unknown>): void => {
      loggedEvents.push(details);
    };
    const logger: BackendLogger = {
      debug: capture,
      error: capture,
      info: capture,
      warn: capture,
    };
    const app = express();
    app.get("/unexpected", (_request, _response, next) => {
      next(new Error("sensitive implementation detail"));
    });
    app.use(createBackendErrorHandler(logger));
    const backend = await listen(createServer(app));

    const response = await fetch(`${backend}/unexpected`);

    assert.equal(response.status, 500);
    assert.deepEqual(await response.json(), { error: "internal_server_error" });
    assert.equal(loggedEvents.length, 1);
    assert.equal(loggedEvents[0].errorCategory, "unexpected_error");
    assert.equal("error" in loggedEvents[0], false);
  });
});
