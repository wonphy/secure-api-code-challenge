import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, describe, it } from "node:test";
import { errors } from "jose";
import { createApp } from "../src/app.js";
import type { JwtVerifier } from "../src/auth/jwt-verifier.js";
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

function configuration(backendUrl: string): GatewayConfiguration {
  return {
    backendUrl,
    isDevelopment: false,
    logLevel: "info",
    port: 0,
  };
}

function createCapturingLogger(
  events: Record<string, unknown>[],
): GatewayLogger {
  const capture = (details: Record<string, unknown>): void => {
    events.push(details);
  };

  return { debug: capture, error: capture, info: capture, warn: capture };
}

describe("zero-trust request flow", () => {
  it("blocks missing and non-Bearer credentials before verification or proxying", async () => {
    let verifyCalls = 0;
    const verifier: JwtVerifier = {
      preload: async () => undefined,
      verify: async () => {
        verifyCalls += 1;
        return "verified-user-123";
      },
    };
    const gateway = await listen(
      createServer(createApp(configuration("http://127.0.0.1:1"), verifier)),
    );

    const missingToken = await fetch(`${gateway}/api/users`);
    const wrongScheme = await fetch(`${gateway}/api/users`, {
      headers: { authorization: "Basic credentials" },
    });

    assert.equal(missingToken.status, 401);
    assert.deepEqual(await missingToken.json(), {
      error: "missing bearer token",
    });
    assert.equal(wrongScheme.status, 401);
    assert.deepEqual(await wrongScheme.json(), {
      error: "missing bearer token",
    });
    assert.equal(verifyCalls, 0);
  });

  it("returns actionable errors for rejected access tokens", async () => {
    const verifier: JwtVerifier = {
      preload: async () => undefined,
      verify: async (token) => {
        if (token === "expired") {
          throw new errors.JWTExpired("expired", {}, "exp", "check_failed");
        }
        if (token === "wrong-audience") {
          throw new errors.JWTClaimValidationFailed(
            "wrong audience",
            {},
            "aud",
            "mismatch",
          );
        }
        if (token === "identity-provider-down") {
          throw new errors.JWKSInvalid("JWKS is unavailable");
        }
        throw new errors.JWSInvalid("malformed token");
      },
    };
    const gateway = await listen(
      createServer(createApp(configuration("http://127.0.0.1:1"), verifier)),
    );

    const expired = await fetch(`${gateway}/api/users`, {
      headers: { authorization: "Bearer expired" },
    });
    const wrongAudience = await fetch(`${gateway}/api/users`, {
      headers: { authorization: "Bearer wrong-audience" },
    });
    const malformed = await fetch(`${gateway}/api/users`, {
      headers: { authorization: "Bearer malformed" },
    });
    const identityProviderDown = await fetch(`${gateway}/api/users`, {
      headers: { authorization: "Bearer identity-provider-down" },
    });

    assert.equal(expired.status, 401);
    assert.match(
      expired.headers.get("www-authenticate") ?? "",
      /invalid_token/,
    );
    assert.deepEqual(await expired.json(), {
      error: "token_expired",
      message: "The access token has expired. Obtain a new token and retry.",
    });
    assert.deepEqual(await wrongAudience.json(), {
      error: "invalid_token_audience",
      message: "The access token was not issued for this API.",
    });
    assert.deepEqual(await malformed.json(), {
      error: "unsupported_token_format",
      message: "The gateway requires a signed JWT access token.",
    });
    assert.equal(identityProviderDown.status, 503);
    assert.deepEqual(await identityProviderDown.json(), {
      error: "identity_provider_unavailable",
      message: "Token verification is temporarily unavailable. Retry shortly.",
    });
  });

  it("fails closed when authentication is not configured or the token has no identity", async () => {
    const unconfiguredGateway = await listen(
      createServer(createApp(configuration("http://127.0.0.1:1"))),
    );
    const missingIdentityGateway = await listen(
      createServer(
        createApp(configuration("http://127.0.0.1:1"), {
          preload: async () => undefined,
          verify: async () => undefined,
        }),
      ),
    );

    const unconfigured = await fetch(`${unconfiguredGateway}/api/users`, {
      headers: { authorization: "Bearer token" },
    });
    const missingIdentity = await fetch(`${missingIdentityGateway}/api/users`, {
      headers: { authorization: "Bearer token" },
    });

    assert.equal(unconfigured.status, 503);
    assert.deepEqual(await unconfigured.json(), {
      error: "gateway authentication is not configured",
    });
    assert.equal(missingIdentity.status, 401);
    assert.deepEqual(await missingIdentity.json(), {
      error: "token_identity_missing",
      message: "The access token does not contain a verified user identity.",
    });
  });

  it("replaces backend 5xx bodies with a safe gateway error", async () => {
    const backend = await listen(
      createServer((_request, response) => {
        response.statusCode = 500;
        response.setHeader("content-type", "application/json");
        response.end(
          JSON.stringify({ error: "database password is not available" }),
        );
      }),
    );
    const verifier: JwtVerifier = {
      preload: async () => undefined,
      verify: async () => "verified-user-123",
    };
    const gateway = await listen(
      createServer(createApp(configuration(backend), verifier)),
    );

    const response = await fetch(`${gateway}/api/users`, {
      headers: { authorization: "Bearer valid-token" },
    });
    const responseBody = await response.text();

    assert.equal(response.status, 500);
    assert.deepEqual(JSON.parse(responseBody), {
      error: "internal_server_error",
    });
    assert.doesNotMatch(responseBody, /database password/);
  });

  it("logs proxy failures without query values or raw error messages", async () => {
    const events: Record<string, unknown>[] = [];
    const verifier: JwtVerifier = {
      preload: async () => undefined,
      verify: async () => "verified-user-123",
    };
    const gateway = await listen(
      createServer(
        createApp(
          configuration("http://127.0.0.1:1"),
          verifier,
          createCapturingLogger(events),
        ),
      ),
    );

    const response = await fetch(`${gateway}/api/users?api_key=secret-value`, {
      headers: { authorization: "Bearer valid-token" },
    });

    assert.equal(response.status, 500);
    const proxyFailure = events.find(
      (event) => event.event === "proxy_request_failed",
    );
    assert.ok(proxyFailure);
    assert.equal(proxyFailure.path, "/api/users");
    assert.equal(proxyFailure.errorCategory, "backend_connection_failed");
    assert.equal("errorMessage" in proxyFailure, false);
  });

  it("replaces caller credentials and identity with the gateway's verified identity", async () => {
    let receivedHeaders:
      Record<string, string | string[] | undefined> | undefined;
    const backend = await listen(
      createServer((request, response) => {
        receivedHeaders = request.headers;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ users: [] }));
      }),
    );
    const verifier: JwtVerifier = {
      preload: async () => undefined,
      verify: async () => "verified-user-123",
    };
    const gateway = await listen(
      createServer(createApp(configuration(backend), verifier)),
    );

    const logLines: string[] = [];
    const originalLog = console.info;
    console.info = (message?: unknown) => {
      logLines.push(String(message));
    };

    let response: Response;
    try {
      response = await fetch(`${gateway}/api/users`, {
        headers: {
          authorization: "Bearer user-access-token",
          "x-verified-user": "attacker-controlled-value",
        },
      });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    } finally {
      console.info = originalLog;
    }

    assert.equal(response.status, 200);
    assert.equal(receivedHeaders?.authorization, undefined);
    assert.equal(receivedHeaders?.["x-verified-user"], "verified-user-123");
    const requestLog = logLines
      .map((line) => JSON.parse(line) as Record<string, unknown>)
      .find((entry) => entry.event === "request_completed");
    assert.ok(requestLog);
    assert.equal(requestLog.method, "GET");
    assert.equal(requestLog.path, "/api/users");
    assert.equal(requestLog.userId, "verified-user-123");
    assert.equal(requestLog.statusCode, 200);
    assert.equal(typeof requestLog.timestamp, "string");
    assert.equal(typeof requestLog.sourceIp, "string");
  });
});
