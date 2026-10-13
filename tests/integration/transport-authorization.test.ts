import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { ZeroTrustHarness } from "./helpers/zero-trust-harness.js";

let harness: ZeroTrustHarness;

beforeAll(async () => {
  harness = new ZeroTrustHarness();
  await harness.startMockOidc();
});

afterAll(async () => harness.close());

// Run the same gateway-to-backend flow across supported transport and policy modes.
describe.each([
  ["http", "identity-only", []],
  ["http", "permissions", ["read:users"]],
  ["mtls", "identity-only", []],
  ["mtls", "permissions", ["read:users"]],
] as const)(
  "%s transport with %s authorization",
  (transport, mode, permissions) => {
    it("forwards an authenticated request through the gateway", async () => {
      const flow = await harness.startFlow({
        authorizationMode: mode,
        transport,
      });
      const response = await fetch(`${flow.gatewayUrl}/api/users`, {
        headers: {
          authorization: `Bearer ${await harness.createAccessToken(undefined, [...permissions])}`,
        },
      });

      expect(response.status).toBe(200);
      if (mode === "permissions") {
        const deniedResponse = await fetch(`${flow.gatewayUrl}/api/users`, {
          headers: {
            authorization: `Bearer ${await harness.createAccessToken()}`,
          },
        });
        expect(deniedResponse.status).toBe(403);
      }
    });
  },
);
