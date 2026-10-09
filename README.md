# secure-api-code-challenge

This is to demonstrate my engineering / coding skills paired with IAM exposure.

## Services

The workspace contains two independently deployable services:

- `@secure-api/gateway`: public API entry point, reverse proxy, and bearer-token validation.
- `@secure-api/backend`: private application API.
- `@secure-api/client`: separate browser client for signing in with OIDC and testing the public gateway API.

The gateway publishes port `3000`; the backend listens on `3001` only inside Docker
Compose. Requests to `GET /api/users` require a bearer token and retain their path
when proxied to the backend. For local Compose simulation, use `local-dev-token`.

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
devbox run simulate
curl -H 'Authorization: Bearer local-dev-token' http://localhost:3000/api/users
```

Stop the simulation with `Ctrl-C`, or remove its containers with `devbox run simulate:down`.

Only use `DEV_GATEWAY_TOKEN` locally. Production configuration must provide
`JWT_JWKS_URL`, `JWT_ISSUER`, and `JWT_AUDIENCE` so the gateway verifies bearer JWTs
against the configured JWKS endpoint.

## OIDC test client

Start the client with `pnpm dev:client` and open `http://localhost:5173`. It is a
separate OIDC public client that uses Authorization Code with PKCE, retains the
access token only in memory, and calls the gateway at `http://localhost:3000`.

Configure its build-time environment in `packages/client/.env.local`:

```sh
VITE_OIDC_ISSUER=https://idp.example.com/realms/demo
VITE_OIDC_CLIENT_ID=secure-api-test-client
VITE_OIDC_SCOPE="openid profile users:read"
VITE_GATEWAY_URL=http://localhost:3000
```

Register `http://localhost:5173/auth/callback` as the client redirect URI at the
OIDC provider. The gateway accepts this origin by default; set `TESTER_ORIGIN` if
the client is hosted elsewhere. In production, configure `JWT_JWKS_URL`,
`JWT_ISSUER`, and `JWT_AUDIENCE` on the gateway to match the OIDC provider and its
access-token audience.
