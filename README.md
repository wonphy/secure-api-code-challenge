# secure-api-code-challenge

This is to demonstrate my engineering / coding skills paired with IAM exposure.

## Services

The workspace contains two independently deployable services:

- `@secure-api/gateway`: public API entry point, reverse proxy, and bearer-token validation.
- `@secure-api/backend`: private application API.

The gateway publishes port `3000`; the backend listens on `3001` only inside Docker
Compose. Requests to `GET /api/users` require a bearer token and retain their path
when proxied to the backend.

## Development

Devbox provides Node.js 22 and pnpm. Enter the development shell, then install
workspace dependencies:

```sh
devbox shell
pnpm install
```

Common commands are available through Devbox or pnpm:

```sh
devbox run dev       # run gateway and backend in watch mode
devbox run dev:gateway
devbox run dev:backend
devbox run check     # type-check, lint, and verify formatting
devbox run format    # apply Prettier formatting
```

To simulate the deployment boundary locally:

```sh
cp packages/gateway/.env.example packages/gateway/.env
# Set JWT_JWKS_URL, JWT_ISSUER, and JWT_AUDIENCE for your OIDC provider.
devbox run simulate
curl -H 'Authorization: Bearer <access-token>' http://localhost:3000/api/users
```

Stop the simulation with `Ctrl-C`, or remove its containers with `devbox run simulate:down`.

Docker Compose loads `packages/gateway/.env` into the gateway container and overrides
only `BACKEND_URL` with the Docker service address. `DEV_GATEWAY_TOKEN` is enabled
only when `NODE_ENV=development`; it is ignored by the Compose image, which runs in
production mode. Production configuration must provide
`JWT_JWKS_URL`, `JWT_ISSUER`, and `JWT_AUDIENCE` so the gateway verifies bearer JWTs
against the configured JWKS endpoint. When JWT configuration is present, the gateway
preloads its JWKS before listening; the container exits if configuration is incomplete
or the configured JWKS cannot be retrieved.

For short-lived authentication diagnostics, set `LOG_LEVEL=debug` in
`packages/gateway/.env` and inspect the gateway container logs. Debug events include
the token segment count, protected-header algorithm, and verification error category,
but never the token or its claims.

Authentication failures use safe, machine-readable response codes. For example, an
expired token returns `401` with `error: "token_expired"` and a `WWW-Authenticate`
header, while a wrong audience returns `error: "invalid_token_audience"`.

After JWT verification, the gateway removes the bearer token and any client-supplied
`X-Verified-User` or `X-Verified-User-Permissions` values before proxying. It injects
the verified subject as `X-Verified-User` and the verified access-token `permissions`
claim as `X-Verified-User-Permissions`. The permissions header is a JSON string array,
such as `["users:read"]`; an absent or unusable claim is `[]`. The backend can use
these trusted gateway assertions for authorization.
