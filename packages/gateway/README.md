# Gateway

The gateway is the public entry point for the protected User API. It validates OIDC access tokens, then proxies authorised `/api/users` requests to the backend.

It is the authentication boundary: the backend receives a trusted `X-Verified-User` header, not the caller's bearer token. Keep the backend on a private/internal network so requests cannot bypass this boundary.

See [SPEC.md](SPEC.md) for the gateway's security, logging, error-handling, and review requirements.

## Responsibilities

- Validate the access token signature, expiry, issuer, and audience against the OIDC provider's JWKS.
- Preload the JWKS during startup so an unavailable identity provider prevents the gateway from becoming ready.
- Return safe, actionable authentication errors (`token_expired`, `invalid_token_audience`, and so on); optional debug logging records metadata without logging tokens.
- Remove inbound `Authorization`, `X-Verified-User`, and `X-Verified-User-Permissions` headers, then inject the verified user identity and access-token permissions for the backend. `X-Verified-User-Permissions` is a JSON string array.
- Write JSON request-completion logs with timestamp, method, path, source IP, response status, and verified user ID when available.
- Disable framework-identifying headers, prevent caching of User API responses, and emit a minimal browser-safety header policy. TLS-only headers such as HSTS are emitted by the TLS-terminating ingress.
- Expose unauthenticated `GET /health` and `GET /ready` probes, and proxy
  protected `/api/users` requests.

```
API client -> gateway -> backend (internal only)
             validates JWT    receives X-Verified-User
```

## Configuration

| Variable                 | Purpose                                                                         | Default                      |
| ------------------------ | ------------------------------------------------------------------------------- | ---------------------------- |
| `PORT`                   | Gateway listen port                                                             | `3000`                       |
| `BACKEND_URL`            | Internal backend base URL                                                       | `http://localhost:3001`      |
| `BACKEND_TIMEOUT_MS`     | Maximum gateway-to-backend request duration, in milliseconds                    | `10000`                      |
| `BACKEND_TLS_MODE`       | `http`, or `mtls` with an HTTPS backend URL and the TLS files below             | `http`                       |
| `BACKEND_ALLOWED_HOSTS`  | Exact internal backend hostnames, comma-separated; required outside development | required outside development |
| `TLS_CA_CERT_PATH`       | CA certificate used to verify the backend; required for `mtls`                  | required for `mtls`          |
| `TLS_CLIENT_CERT_PATH`   | Gateway client certificate; required for `mtls`                                 | required for `mtls`          |
| `TLS_CLIENT_KEY_PATH`    | Gateway client private key; required for `mtls`                                 | required for `mtls`          |
| `JWT_JWKS_URL`           | OIDC provider JWKS endpoint                                                     | required outside development |
| `JWT_ISSUER`             | Expected access-token issuer                                                    | required outside development |
| `JWT_AUDIENCE`           | Expected access-token audience                                                  | required outside development |
| `JWT_ALLOWED_ALGORITHMS` | Approved asymmetric JWT signing algorithms, comma-separated                     | `RS256`                      |
| `LOG_LEVEL`              | Minimum emitted level: `debug`, `info`, `warn`, or `error`                      | `info`                       |
| `DEV_GATEWAY_TOKEN`      | Local token fallback                                                            | development only             |
| `DEV_GATEWAY_USER`       | Identity sent for the local fallback                                            | `local-dev-user`             |

JWT settings are required unless `NODE_ENV=development`. A partial JWT
configuration is rejected at startup. Outside development, the JWKS endpoint
must use HTTPS and the backend URL hostname must exactly match
`BACKEND_ALLOWED_HOSTS`. `RS256` is the default Auth0-compatible signing
algorithm; only approved asymmetric algorithms can be configured. In `mtls`
mode, `BACKEND_URL` must use HTTPS and all three TLS paths are required.
Root-level documentation covers local configuration and deployment.

### Token policy

The gateway verifies the JWT signature, issuer, audience, and expiry. The JWT
library also enforces `nbf` when that claim is present. The proof of concept
uses `sub` as the gateway identity assertion and accepts a non-empty `email`
claim only as a fallback, as permitted by the challenge brief.

For production, require `sub` as the durable user identifier: email addresses
can change, be reassigned, or represent personal information in gateway logs.
Agree an access-token lifetime with the identity-provider owner before
enforcing a maximum lifetime. That policy should require `iat` and reject a
token whose `exp - iat` exceeds the approved limit; do not introduce a
hard-coded lifetime that might reject the provider's legitimate tokens.

`info` logs successful requests and lifecycle events. `warn` retains client and authentication failures while suppressing successful-request logs; `error` retains unexpected and proxy failures only. `debug` additionally emits safe JWT diagnostics.

## Project structure

```
src/
├── app.ts                 Express route and middleware composition
├── server.ts              Startup, configuration loading, and JWKS readiness check
├── auth/
│   ├── auth-middleware.ts Token extraction and verified-identity handoff
│   ├── auth-errors.ts     Safe HTTP responses for verification failures
│   └── jwt-verifier.ts    OIDC JWT verification and JWKS resolver
├── config/
│   └── environment.ts     Environment validation and configuration model
├── errors/
│   └── http-errors.ts     Safe JSON error and unknown-route responses
├── logging/
│   ├── gateway-logger.ts  Structured logger and log filtering
│   └── request-logger.ts  Request-completion logging
├── proxy/
│   └── users-proxy.ts     Protected backend proxy and header boundary
├── security/
│   └── response-headers.ts Browser-safety and API cache-control headers
└── types/
    └── express.d.ts       Type for the verified identity held during a request
```

The backend must reject a request that lacks `X-Verified-User`; that provides the second half of the zero-trust flow if it is accidentally exposed directly.

The gateway does not make authorization decisions. The backend is responsible for determining whether the verified user may perform an operation and for returning domain-level `403` responses. The gateway returns safe JSON `400`, `401`, `404`, and `500` transport errors without exposing stack traces. It also replaces backend `5xx` response bodies with its safe `500` response.
