import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, describe, it } from "node:test";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createJwtVerifier } from "../src/auth/jwt-verifier.js";

const issuer = "https://issuer.example.test/";
const audience = "secure-api";
const keyId = "test-signing-key";

let jwksUrl: URL;
let jwksRequests = 0;
let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let untrustedPrivateKey: Awaited<
  ReturnType<typeof generateKeyPair>
>["privateKey"];
let closeServer: () => Promise<void>;

before(async () => {
  const { privateKey: signingKey, publicKey } = await generateKeyPair("RS256");
  privateKey = signingKey;
  ({ privateKey: untrustedPrivateKey } = await generateKeyPair("RS256"));
  const publicJwk = await exportJWK(publicKey);
  publicJwk.kid = keyId;
  publicJwk.alg = "RS256";

  const server = createServer((request, response) => {
    assert.equal(request.url, "/.well-known/jwks.json");
    jwksRequests += 1;
    response.setHeader("content-type", "application/json");
    response.end(JSON.stringify({ keys: [publicJwk] }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  jwksUrl = new URL(`http://127.0.0.1:${address.port}/.well-known/jwks.json`);
  closeServer = () =>
    new Promise((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
});

after(async () => closeServer());

async function createAccessToken(
  overrides: {
    audience?: string;
    expiresAt?: number;
    issuer?: string;
    omitExpiration?: boolean;
    omitSubject?: boolean;
    permissions?: unknown;
    signingKey?: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
  } = {},
): Promise<string> {
  let token = new SignJWT(
    overrides.permissions === undefined
      ? {}
      : { permissions: overrides.permissions },
  )
    .setProtectedHeader({ alg: "RS256", kid: keyId })
    .setIssuer(overrides.issuer ?? issuer)
    .setAudience(overrides.audience ?? audience)
    .setIssuedAt();

  if (!overrides.omitExpiration) {
    token = token.setExpirationTime(overrides.expiresAt ?? "5m");
  }

  if (!overrides.omitSubject) {
    token.setSubject("oidc-user-123");
  }

  return token.sign(overrides.signingKey ?? privateKey);
}

describe("OIDC JWT validation", () => {
  it("accepts a correctly signed access token from the mocked OIDC provider", async () => {
    const verifier = createJwtVerifier({ audience, issuer, jwksUrl });
    const requestsBeforePreload = jwksRequests;
    await verifier.preload();
    const requestsAfterPreload = jwksRequests;

    assert.deepEqual(await verifier.verify(await createAccessToken()), {
      userId: "oidc-user-123",
      permissions: [],
    });
    assert.equal(requestsAfterPreload, requestsBeforePreload + 1);
    assert.equal(jwksRequests, requestsAfterPreload);
  });

  it("rejects tokens with an unexpected audience, issuer, missing or expired lifetime, or signature", async () => {
    const verifier = createJwtVerifier({ audience, issuer, jwksUrl });
    await verifier.preload();

    await assert.rejects(() =>
      createAccessToken({ audience: "other-api" }).then((token) =>
        verifier.verify(token),
      ),
    );
    await assert.rejects(() =>
      createAccessToken({ issuer: "https://untrusted.example.test/" }).then(
        (token) => verifier.verify(token),
      ),
    );
    await assert.rejects(() =>
      createAccessToken({ expiresAt: Math.floor(Date.now() / 1000) - 1 }).then(
        (token) => verifier.verify(token),
      ),
    );
    await assert.rejects(() =>
      createAccessToken({ omitExpiration: true }).then((token) =>
        verifier.verify(token),
      ),
    );
    await assert.rejects(() =>
      createAccessToken({ signingKey: untrustedPrivateKey }).then((token) =>
        verifier.verify(token),
      ),
    );
  });

  it("returns no identity when a valid access token has no subject", async () => {
    const verifier = createJwtVerifier({ audience, issuer, jwksUrl });
    await verifier.preload();

    assert.equal(
      await verifier.verify(await createAccessToken({ omitSubject: true })),
      undefined,
    );
  });

  it("returns the verified permissions claim", async () => {
    const verifier = createJwtVerifier({ audience, issuer, jwksUrl });
    await verifier.preload();

    assert.deepEqual(
      await verifier.verify(
        await createAccessToken({
          permissions: ["users:read", "users:write"],
        }),
      ),
      {
        userId: "oidc-user-123",
        permissions: ["users:read", "users:write"],
      },
    );
  });

  it("uses an empty permission list when the claim is unusable", async () => {
    const verifier = createJwtVerifier({ audience, issuer, jwksUrl });
    await verifier.preload();

    assert.deepEqual(
      await verifier.verify(
        await createAccessToken({ permissions: ["users:read", 1] }),
      ),
      { userId: "oidc-user-123", permissions: [] },
    );
  });

  it("fails preload when the OIDC provider cannot supply a JWKS", async () => {
    const unavailableProvider = createServer((_request, response) => {
      response.statusCode = 503;
      response.end();
    });
    await new Promise<void>((resolve) =>
      unavailableProvider.listen(0, "127.0.0.1", resolve),
    );
    const address = unavailableProvider.address();
    assert.ok(address && typeof address !== "string");
    const unavailableJwksUrl = new URL(
      `http://127.0.0.1:${address.port}/.well-known/jwks.json`,
    );
    const verifier = createJwtVerifier({
      audience,
      issuer,
      jwksUrl: unavailableJwksUrl,
    });

    try {
      await assert.rejects(() => verifier.preload());
    } finally {
      await new Promise<void>((resolve, reject) =>
        unavailableProvider.close((error) =>
          error ? reject(error) : resolve(),
        ),
      );
    }
  });
});
