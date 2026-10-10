import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { afterEach, describe, it } from "node:test";
import { createApp } from "../src/app.js";
import type { BackendConfiguration } from "../src/config/environment.js";

const servers: Server[] = [];
const configuration: BackendConfiguration = {
  authorizationMode: "identity-only",
  logLevel: "error",
  port: 0,
};
const permissionsConfiguration: BackendConfiguration = {
  ...configuration,
  authorizationMode: "permissions",
};
const mutualTlsConfiguration: BackendConfiguration = {
  ...configuration,
  mutualTls: {
    caCertificatePath: "/certs/ca.crt",
    expectedClientCommonName: "gateway",
    serverCertificatePath: "/certs/backend.crt",
    serverKeyPath: "/certs/backend.key",
  },
};
const contentTypeHeader = { "content-type": "application/json" };

function permissionHeaders(...permissions: string[]): Record<string, string> {
  return {
    "x-verified-user": "gateway-verified-user",
    "x-verified-user-permissions": JSON.stringify(permissions),
  };
}

const verifiedHeaders = permissionHeaders(
  "create:user",
  "delete:user",
  "read:user",
  "read:users",
  "update:user",
);
const insufficientPermissionHeaders = permissionHeaders("unrelated:permission");

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

async function startBackend(
  backendConfiguration = configuration,
): Promise<string> {
  const server = createServer(createApp(backendConfiguration));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  return `http://127.0.0.1:${address.port}`;
}

async function createUser(
  backend: string,
  input: { name: string; email: string },
): Promise<{ id: string; name: string; email: string }> {
  const response = await fetch(`${backend}/api/users`, {
    method: "POST",
    headers: { ...verifiedHeaders, ...contentTypeHeader },
    body: JSON.stringify(input),
  });
  assert.equal(response.status, 201);
  return (
    (await response.json()) as {
      user: { id: string; name: string; email: string };
    }
  ).user;
}

describe("users API", () => {
  it("blocks direct requests that do not contain a gateway assertion", async () => {
    const backend = await startBackend();

    const response = await fetch(`${backend}/api/users`);

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "verified_user_required",
    });
  });

  it("rejects an HTTP request when mTLS mode is enabled", async () => {
    const backend = await startBackend(mutualTlsConfiguration);

    const response = await fetch(`${backend}/api/users`, {
      headers: { "x-verified-user": "attacker-controlled-value" },
    });

    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), {
      error: "trusted_gateway_required",
    });
  });

  it("requires the exact permission for every user route", async () => {
    const backend = await startBackend(permissionsConfiguration);
    const user = await createUser(backend, {
      name: "Ada Lovelace",
      email: "ada@example.test",
    });
    const deniedRequests: ReadonlyArray<{ path: string; init: RequestInit }> = [
      { path: "/api/users", init: {} },
      { path: `/api/users/${user.id}`, init: {} },
      {
        path: "/api/users",
        init: {
          method: "POST",
          body: JSON.stringify({
            name: "Grace Hopper",
            email: "grace@example.test",
          }),
        },
      },
      {
        path: `/api/users/${user.id}`,
        init: { method: "PUT", body: JSON.stringify({ name: "Ada Byron" }) },
      },
      { path: `/api/users/${user.id}`, init: { method: "DELETE" } },
    ];

    for (const { path, init } of deniedRequests) {
      const response = await fetch(`${backend}${path}`, {
        ...init,
        headers: { ...insufficientPermissionHeaders, ...contentTypeHeader },
      });

      assert.equal(response.status, 403);
      assert.deepEqual(await response.json(), {
        error: "insufficient_permissions",
      });
    }
  });

  it("rejects malformed permission assertions and invalid request bodies", async () => {
    const backend = await startBackend(permissionsConfiguration);
    const malformedPermissions = await fetch(`${backend}/api/users`, {
      headers: {
        "x-verified-user": "gateway-verified-user",
        "x-verified-user-permissions": "not-json",
      },
    });
    assert.equal(malformedPermissions.status, 403);

    const invalidCreate = await fetch(`${backend}/api/users`, {
      method: "POST",
      headers: { ...verifiedHeaders, ...contentTypeHeader },
      body: JSON.stringify({ name: " ", email: "ada@example.test" }),
    });
    assert.equal(invalidCreate.status, 400);
    assert.deepEqual(await invalidCreate.json(), {
      error: "name_and_email_are_required",
    });

    const invalidUpdate = await fetch(`${backend}/api/users/does-not-matter`, {
      method: "PUT",
      headers: { ...verifiedHeaders, ...contentTypeHeader },
      body: JSON.stringify({}),
    });
    assert.equal(invalidUpdate.status, 400);
    assert.deepEqual(await invalidUpdate.json(), {
      error: "name_or_email_is_required",
    });
  });

  it("allows a gateway-verified identity without a permissions assertion by default", async () => {
    const backend = await startBackend();

    const response = await fetch(`${backend}/api/users`, {
      headers: { "x-verified-user": "gateway-verified-user" },
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { users: [] });
  });

  it("allows writes with only a gateway-verified identity in identity-only mode", async () => {
    const backend = await startBackend();

    const response = await fetch(`${backend}/api/users`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-verified-user": "gateway-verified-user",
      },
      body: JSON.stringify({ name: "Ada Lovelace", email: "ada@example.test" }),
    });

    assert.equal(response.status, 201);
    const body = (await response.json()) as {
      user: { id: string; name: string; email: string };
    };
    assert.match(body.user.id, /^[0-9a-f-]{36}$/i);
    assert.equal(body.user.name, "Ada Lovelace");
    assert.equal(body.user.email, "ada@example.test");
  });

  it("creates, reads, updates, and deletes in-memory users", async () => {
    const backend = await startBackend();
    const user = await createUser(backend, {
      name: "Ada Lovelace",
      email: "Ada@Example.Test",
    });
    assert.equal(user.name, "Ada Lovelace");
    assert.equal(user.email, "ada@example.test");

    const readUser = await fetch(`${backend}/api/users/${user.id}`, {
      headers: verifiedHeaders,
    });
    assert.equal(readUser.status, 200);
    assert.deepEqual(await readUser.json(), { user });

    const duplicate = await fetch(`${backend}/api/users`, {
      method: "POST",
      headers: { ...verifiedHeaders, ...contentTypeHeader },
      body: JSON.stringify({
        name: "Ada Duplicate",
        email: "ADA@EXAMPLE.TEST",
      }),
    });
    assert.equal(duplicate.status, 409);
    assert.deepEqual(await duplicate.json(), { error: "email_already_exists" });

    const updated = await fetch(`${backend}/api/users/${user.id}`, {
      method: "PUT",
      headers: { ...verifiedHeaders, ...contentTypeHeader },
      body: JSON.stringify({ name: "Ada Byron" }),
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(await updated.json(), {
      user: { ...user, name: "Ada Byron" },
    });

    const secondUser = await createUser(backend, {
      name: "Grace Hopper",
      email: "grace@example.test",
    });
    const conflictingUpdate = await fetch(
      `${backend}/api/users/${secondUser.id}`,
      {
        method: "PUT",
        headers: { ...verifiedHeaders, ...contentTypeHeader },
        body: JSON.stringify({ email: "ada@example.test" }),
      },
    );
    assert.equal(conflictingUpdate.status, 409);
    assert.deepEqual(await conflictingUpdate.json(), {
      error: "email_already_exists",
    });

    const missingUpdate = await fetch(`${backend}/api/users/missing-user`, {
      method: "PUT",
      headers: { ...verifiedHeaders, ...contentTypeHeader },
      body: JSON.stringify({ name: "No User" }),
    });
    assert.equal(missingUpdate.status, 404);

    const list = await fetch(`${backend}/api/users`, {
      headers: verifiedHeaders,
    });
    assert.deepEqual(await list.json(), {
      users: [{ ...user, name: "Ada Byron" }, secondUser],
    });

    const deleted = await fetch(`${backend}/api/users/${user.id}`, {
      method: "DELETE",
      headers: verifiedHeaders,
    });
    assert.equal(deleted.status, 204);

    const missingUser = await fetch(`${backend}/api/users/${user.id}`, {
      headers: verifiedHeaders,
    });
    assert.equal(missingUser.status, 404);
    assert.deepEqual(await missingUser.json(), { error: "user_not_found" });

    const missingDelete = await fetch(`${backend}/api/users/${user.id}`, {
      method: "DELETE",
      headers: verifiedHeaders,
    });
    assert.equal(missingDelete.status, 404);
  });
});
