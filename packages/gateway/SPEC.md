# Gateway Specification

## Purpose

The gateway is the public authentication and transport boundary for the protected User API. It validates OIDC access tokens and proxies authenticated requests to the internal backend.

It does not make domain authorization decisions. The backend determines whether the verified user may perform an operation and returns authorization responses such as `403`.

## Trust boundary

```
API client -> Gateway -> Backend (private network)
              validates JWT    receives X-Verified-User only
```

The backend must not be publicly reachable. A direct backend request without `X-Verified-User` must be rejected.

## Security principles

- Treat every client request as untrusted until its bearer access token is verified.
- Require the `Bearer <token>` authorization scheme for protected endpoints.
- Validate JWT signature, expiry, issuer, and audience using the configured OIDC JWKS.
- Retrieve the JWKS before listening for traffic; fail startup if it is unavailable or configuration is incomplete.
- Derive the backend identity assertion exclusively from the verified token `sub` claim.
- Remove the caller's `Authorization` and `X-Verified-User` headers before proxying.
- Do not log bearer tokens, JWT claims, request query values, credentials, or raw error messages.
- Replace backend `5xx` response bodies with the gateway's safe `500` response. Backend `4xx` responses, including authorization decisions, are proxied unchanged.

## Logging policy

All gateway logs are JSON objects with a timestamp and level.

Request-completion events include:

- `timestamp`
- `level`
- `method`
- `path` (without query string)
- `sourceIp`
- `userId` when authentication succeeds
- `statusCode`
- `durationMs`

Supported `LOG_LEVEL` values are `debug`, `info`, `warn`, and `error`.

| Level   | Events                                                                   |
| ------- | ------------------------------------------------------------------------ |
| `debug` | Safe JWT diagnostics: token structure and protected-header metadata only |
| `info`  | Successful requests and lifecycle events                                 |
| `warn`  | Client and authentication failures (`4xx`)                               |
| `error` | Dependency, proxy, and unexpected server failures (`5xx`)                |

Logs use stable error categories rather than raw error messages. Store and retain logs according to the environment's operational policy.

## HTTP response policy

| Scenario                                      | Response                                                 |
| --------------------------------------------- | -------------------------------------------------------- |
| Missing or non-Bearer credentials             | `401` JSON error                                         |
| Invalid, expired, or incorrectly scoped token | `401` JSON error and `WWW-Authenticate` where applicable |
| OIDC verification unavailable                 | `503` JSON error                                         |
| Unknown gateway route                         | `404` JSON error                                         |
| Malformed request handled by the gateway      | `400` JSON error                                         |
| Backend returns `4xx`                         | Proxy backend response unchanged                         |
| Backend unavailable or returns `5xx`          | `500` JSON `internal_server_error`                       |
| Unexpected gateway failure                    | `500` JSON `internal_server_error`                       |

Client responses must never contain stack traces or raw internal error messages.

## Configuration requirements

- `JWT_JWKS_URL`, `JWT_ISSUER`, and `JWT_AUDIENCE` are all required outside `NODE_ENV=development`.
- Partial JWT configuration is invalid and prevents startup.
- `JWT_JWKS_URL` must use HTTPS outside development, and `JWT_ALLOWED_ALGORITHMS` defaults to `RS256` from a validated asymmetric allowlist.
- `DEV_GATEWAY_TOKEN` and `DEV_GATEWAY_USER` apply only in development.
- `BACKEND_URL` must use HTTP(S), contain no embedded credentials, and exactly match a hostname in `BACKEND_ALLOWED_HOSTS` outside development.
- `LOG_LEVEL` must be one of the supported values.

## Review checklist

- [ ] Protected routes authenticate before reaching the proxy.
- [ ] The gateway removes client-supplied identity and authorization headers before proxying.
- [ ] Only a verified `sub` is placed in `X-Verified-User`.
- [ ] The backend is network-private and rejects requests without `X-Verified-User`.
- [ ] JWT verification checks signature, expiry, issuer, and audience.
- [ ] JWKS preload fails startup when the identity provider is unavailable.
- [ ] Request logs include required fields and no query string or token data.
- [ ] Error logs use safe categories, not raw error messages.
- [ ] Gateway-generated failures return safe JSON without stacks.
- [ ] Backend `5xx` response bodies are not exposed through the gateway.
- [ ] Gateway tests cover JWT verification, authentication failures, proxy boundary headers, log filtering, and safe error behavior.
