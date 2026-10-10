# Secure API Code Challenge

Secure Entry is a small Zero Trust proof of concept: the gateway is the only
public authentication boundary, while the User API trusts only identity
assertions injected by that gateway. It demonstrates engineering practice
alongside CIAM/OIDC experience.

## Traffic flow

```text
                         OIDC provider
                    (JWKS cached by gateway)
                               |
Client -- Bearer access token -> Gateway :3000 -- internal request --> Backend :3001
                               |                                      |
                               | verifies signature, exp, iss, aud    | requires
                               | removes caller credentials            | X-Verified-User
                               +-- adds X-Verified-User -------------->+-- User API

Client -- direct request to backend ----------------------------------> 403 Forbidden
Client -- no/invalid token to gateway --------------------------------> 401 Unauthorized
```

The gateway validates an access token against the configured OIDC JWKS and
preloads the JWKS before it becomes ready. The JWT verifier's remote-JWKS
resolver caches keys locally and refreshes when key rotation requires it; it
does not retrieve JWKS on every request. On success, the gateway removes
caller-supplied `Authorization`, `X-Verified-User`, and
`X-Verified-User-Permissions` headers, then injects trusted assertions. The
backend does not parse or validate JWTs.

## Services and API

| Service               | Role                                                 | Port                              |
| --------------------- | ---------------------------------------------------- | --------------------------------- |
| `@secure-api/gateway` | Public reverse proxy and OIDC access-token validator | `3000`                            |
| `@secure-api/backend` | Private, in-memory User API                          | `3001` (not published by Compose) |

The protected API supports `GET`, `POST`, `PUT`, and `DELETE` on
`/api/users`, plus `GET /api/users/:id`. `POST` expects a JSON object with
`name` and `email`; `PUT` accepts either field. The user list resets whenever
the backend restarts.

Both services return safe JSON errors and never expose stack traces. Gateway
request logs are JSON and include timestamp, method, path, source IP, response
status, and verified user ID where applicable.

## Prerequisites

- Node.js 22+ and pnpm 10+, or [Devbox](https://www.jetify.com/devbox)
- Docker and Docker Compose for the deployment-like run
- An OIDC provider developer tenant (for example Auth0, Okta, or Amazon
  Cognito) and a test user

Install dependencies:

```sh
devbox shell
pnpm install
```

## Configure OIDC

1. In the OIDC provider, create an API/resource server with identifier
   `secure-api` (or choose another value and use it as `JWT_AUDIENCE`).
2. Configure the API to issue asymmetric, signed access tokens. `RS256` is the
   default expected by this project.
3. Create a test user and an application/client allowed to obtain an access
   token for that API. Use an access token, not an ID token.
4. Find the provider's issuer and discovery document. The JWKS URL is normally
   the `jwks_uri` field in `https://<issuer>/.well-known/openid-configuration`.
5. Copy the gateway environment template and replace the example values. The
   issuer value must match the token's `iss` claim exactly (including a trailing
   slash where the provider uses one).

```sh
cp packages/gateway/.env.example packages/gateway/.env
cp packages/backend/.env.example packages/backend/.env
```

Example `packages/gateway/.env`:

```dotenv
PORT=3000
BACKEND_URL=http://backend:3001
BACKEND_ALLOWED_HOSTS=backend
BACKEND_TLS_MODE=http

JWT_JWKS_URL=https://your-tenant.example/.well-known/jwks.json
JWT_ISSUER=https://your-tenant.example/
JWT_AUDIENCE=secure-api
JWT_ALLOWED_ALGORITHMS=RS256
LOG_LEVEL=info
```

The three `JWT_*` identity values must be supplied together. In deployed
environments, the JWKS URL must be HTTPS and `BACKEND_ALLOWED_HOSTS` must
contain the exact host in `BACKEND_URL`. Never commit `.env` files or access
tokens.

## Run the services

### Docker Compose (recommended for OIDC)

Compose reads both `.env` files, publishes only the gateway, and connects the
backend on the internal Docker network:

```sh
devbox run simulate
# equivalent: docker compose up --build
```

The gateway will exit at startup if it cannot retrieve the configured JWKS or
if its JWT configuration is incomplete. Stop the stack with `Ctrl-C`, then
remove containers with:

```sh
devbox run simulate:down
```

### Local development

Start the backend in one terminal:

```sh
devbox shell
pnpm dev:backend
```

Start the gateway in another terminal. Export its variables explicitly because
the Node development command does not load `.env` automatically:

```sh
devbox shell
set -a; source packages/gateway/.env; set +a
BACKEND_URL=http://localhost:3001 pnpm dev:gateway
```

For a no-IdP smoke test only, omit all `JWT_*` variables and use the
development fallback below. It works only while `NODE_ENV=development` and is
not available in Compose/production:

```sh
DEV_GATEWAY_TOKEN=local-dev-token DEV_GATEWAY_USER=local-dev-user \
  pnpm dev:gateway
```

## Demonstrate the Zero Trust flow

Set an access token obtained from your provider, then make a successful request
through the gateway:

```sh
export ACCESS_TOKEN='<OIDC access token for the configured audience>'
curl -i http://localhost:3000/api/users \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

For the local fallback, substitute `local-dev-token`:

```sh
curl -i http://localhost:3000/api/users \
  -H 'Authorization: Bearer local-dev-token'
```

Expected result: `200 OK` and a JSON `{ "users": [...] }` payload. Create a
user through the same boundary:

```sh
curl -i -X POST http://localhost:3000/api/users \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H 'Content-Type: application/json' \
  --data '{"name":"Ada Lovelace","email":"ada@example.test"}'
```

The gateway blocks missing or invalid credentials before a request can reach
the backend:

```sh
# No token: 401 Unauthorized
curl -i http://localhost:3000/api/users

# Invalid token: 401 Unauthorized
curl -i http://localhost:3000/api/users \
  -H 'Authorization: Bearer not-a-valid-jwt'
```

When using the local-development layout (where port 3001 is reachable), a
direct backend request without the gateway assertion is rejected:

```sh
# Direct backend bypass: 403 Forbidden
curl -i http://localhost:3001/api/users
```

In the Compose layout the backend port is intentionally not published, so the
same bypass attempt cannot connect from the host. That network isolation is an
additional deployment safeguard. The `X-Verified-User` header is a trusted
gateway assertion only because the backend is kept private; do not expose the
backend directly to untrusted clients.

## Tests and quality checks

Run the complete test suite:

```sh
devbox run test
# or: pnpm test
```

Gateway tests mock the OIDC/JWKS provider and cover signature, expiry, issuer,
and audience validation as well as JWKS startup behaviour. Zero Trust tests
prove that a missing token is blocked by the gateway, a backend bypass is
forbidden, and a verified identity is forwarded only after authentication.

```sh
devbox run check          # type-check, lint, and check formatting
devbox run format         # apply Prettier formatting
devbox run simulate:mtls  # optional gateway-to-backend mTLS overlay
```

See the service-level documentation for implementation detail:

- [Gateway](packages/gateway/README.md)
- [Backend](packages/backend/README.md)
