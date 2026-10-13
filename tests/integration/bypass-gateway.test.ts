import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import {
  ZeroTrustHarness,
  type FlowEndpoints,
} from "./helpers/zero-trust-harness.js";

let httpFlow: FlowEndpoints;
let harness: ZeroTrustHarness;

beforeAll(async () => {
  harness = new ZeroTrustHarness();
  await harness.startMockOidc();
  httpFlow = await harness.startFlow({
    authorizationMode: "identity-only",
    transport: "http",
  });
});

afterAll(async () => harness.close());

describe("bypass:gateway", () => {
  it("HTTP: rejects a direct backend request without a gateway assertion", async () => {
    const response = await fetch(`${httpFlow.backendUrl}/api/users`);

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "verified_user_required" });
  });

  it("mTLS: rejects a direct connection without the gateway client certificate", async () => {
    const flow = await harness.startFlow({
      authorizationMode: "identity-only",
      transport: "mtls",
    });

    // The backend rejects the TLS peer before an HTTP request can be handled.
    await expect(
      harness.requestWithoutClientCertificate(`${flow.backendUrl}/api/users`),
    ).rejects.toThrow();
  });
});
