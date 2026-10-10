# Gateway

The gateway is the public entry point for the protected User API. It validates OIDC access tokens, then proxies authorised `/api/users` requests to the backend.

It is the authentication boundary: the backend receives a trusted `X-Verified-User` header, not the caller's bearer token. Keep the backend on a private/internal network so requests cannot bypass this boundary.

## Responsibilities

- Validate the access token signature, expiry, issuer, and audience against the OIDC provider's JWKS.
- Preload the JWKS during startup so an unavailable identity provider prevents the gateway from becoming ready.
- Return safe, actionable authentication errors (`token_expired`, `invalid_token_audience`, and so on); optional debug logging records metadata without logging tokens.
- Remove inbound `Authorization` and `X-Verified-User` headers, then inject the verified user identity for the backend.
- Expose `GET /health` without authentication and proxy protected `/api/users` requests.

```
API client -> gateway -> backend (internal only)
             validates JWT    receives X-Verified-User
```

## Configuration

| Variable            | Purpose                                       | Default                      |
| ------------------- | --------------------------------------------- | ---------------------------- |
| `PORT`              | Gateway listen port                           | `3000`                       |
| `BACKEND_URL`       | Internal backend base URL                     | `http://localhost:3001`      |
| `JWT_JWKS_URL`      | OIDC provider JWKS endpoint                   | required outside development |
| `JWT_ISSUER`        | Expected access-token issuer                  | required outside development |
| `JWT_AUDIENCE`      | Expected access-token audience                | required outside development |
| `LOG_LEVEL`         | Set to `debug` for authentication diagnostics | `info`                       |
| `DEV_GATEWAY_TOKEN` | Local token fallback                          | development only             |
| `DEV_GATEWAY_USER`  | Identity sent for the local fallback          | `local-dev-user`             |

Copy [`.env.example`](.env.example) to `.env` and supply the OIDC values. The root Compose configuration loads `packages/gateway/.env`; a standalone process must receive these variables from its shell or process manager. JWT settings are required unless `NODE_ENV=development`. A partial JWT configuration is rejected at startup.

## Project structure

```
src/
├── app.ts                 Express route and middleware composition
├── server.ts              Startup, configuration loading, and JWKS readiness check
├── auth/
│   ├── auth-middleware.ts Token extraction and verified-identity handoff
│   ├── auth-errors.ts     Safe HTTP responses for verification failures
│   ├── auth-debug.ts      Debug-only token metadata logging
│   └── jwt-verifier.ts    OIDC JWT verification and JWKS resolver
├── config/
│   └── environment.ts     Environment validation and configuration model
├── proxy/
│   └── users-proxy.ts     Protected backend proxy and header boundary
└── types/
    └── express.d.ts       Type for the verified identity held during a request
```

The backend must reject a request that lacks `X-Verified-User`; that provides the second half of the zero-trust flow if it is accidentally exposed directly.
