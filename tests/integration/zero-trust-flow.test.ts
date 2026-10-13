import type { IncomingMessage } from "node:http";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  ZeroTrustHarness,
  type FlowEndpoints,
} from "./helpers/zero-trust-harness.js";

const backendRequestSpy = jest.fn<(request: IncomingMessage) => void>();
let flow: FlowEndpoints;
let harness: ZeroTrustHarness;

beforeAll(async () => {
  harness = new ZeroTrustHarness();
  await harness.startMockOidc();
  flow = await harness.startFlow({
    authorizationMode: "identity-only",
    onBackendRequest: backendRequestSpy,
    transport: "http",
  });
});

beforeEach(() => {
  backendRequestSpy.mockClear();
});

afterAll(async () => harness.close());

describe("zero-trust integration flow", () => {
  it("blocks a request without a token before it reaches the backend", async () => {
    const response = await fetch(`${flow.gatewayUrl}/api/users`);

    expect(response.status).toBe(401);
    expect(backendRequestSpy).not.toHaveBeenCalled();
  });

  it("verifies a mock-OIDC token and forwards a trusted identity to the real backend", async () => {
    const response = await fetch(`${flow.gatewayUrl}/api/users`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${await harness.createAccessToken()}`,
        "content-type": "application/json",
        "x-verified-user": "attacker-controlled-user",
        "x-verified-user-permissions": '["admin"]',
      },
      body: JSON.stringify({ name: "Ada Lovelace", email: "ada@example.test" }),
    });

    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({
      user: { email: "ada@example.test", name: "Ada Lovelace" },
    });
    expect(backendRequestSpy).toHaveBeenCalledTimes(1);
    const forwardedRequest = backendRequestSpy.mock.calls[0][0];
    // The gateway removes caller credentials and injects its verified assertion.
    expect(forwardedRequest.headers.authorization).toBeUndefined();
    expect(forwardedRequest.headers["x-verified-user"]).toBe(
      "integration-user-123",
    );
    expect(forwardedRequest.headers["x-verified-user-permissions"]).toBe("[]");

    const secondResponse = await fetch(`${flow.gatewayUrl}/api/users`, {
      headers: { authorization: `Bearer ${await harness.createAccessToken()}` },
    });
    expect(secondResponse.status).toBe(200);
    expect(harness.jwksRequests).toBe(1);
  });

  it("blocks an invalid token before it reaches the backend", async () => {
    const response = await fetch(`${flow.gatewayUrl}/api/users`, {
      headers: {
        authorization: `Bearer ${await harness.createAccessToken("another-api")}`,
      },
    });

    expect(response.status).toBe(401);
    expect(backendRequestSpy).not.toHaveBeenCalled();
  });
});
