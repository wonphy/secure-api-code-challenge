# Secure Entry Zero Trust API

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

## Security responsibilities

| Concern        | Gateway                                                                                                                             | Backend                                                                                                              |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Authentication | Requires `Authorization: Bearer <JWT>` and verifies the signature, `exp`, `iss`, and `aud` using cached OIDC JWKS.                  | Does not decode or validate JWTs.                                                                                    |
| Proxying       | Removes caller-controlled credentials and identity headers, then injects the verified user identity before forwarding `/api/users`. | Is reachable only on the internal network in Compose.                                                                |
| Authorization  | Does not make user-API permission decisions.                                                                                        | Requires `X-Verified-User`; optional permission mode uses the trusted permissions assertion supplied by the gateway. |
| Error handling | Rejects missing or invalid authentication with `401`; does not forward the request.                                                 | Rejects requests missing the gateway assertion with `403`.                                                           |

The backend header check is intentionally a _trust-boundary_ control, not a
substitute for network isolation: an untrusted client must never be able to
reach the backend and supply its own identity header.

## Project layout

```text
packages/
├── gateway/                 # Express reverse proxy, OIDC verifier, JSON logging
│   ├── src/auth/             # Bearer extraction, JWT/JWKS verification
│   ├── src/proxy/            # Header boundary and users proxy
│   └── test/                 # Mocked OIDC and Zero Trust tests
└── backend/                 # Private Express User API
    ├── src/trust/            # Gateway assertion and permission guards
    ├── src/users/            # In-memory CRUD store and routes
    └── test/                 # API and HTTP-behaviour tests
```

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

### Optional: Devbox toolchain

[Devbox](https://www.jetify.com/devbox) is an optional way to use the pinned
project toolchain without globally installing Node.js, pnpm, Terraform, or the
local GitHub Actions runner, `act`. The versions are defined in
[`devbox.json`](devbox.json).

Install Devbox using the [official installation guide](https://www.jetify.com/devbox/docs/installing_devbox/), then enter the project environment:

```sh
devbox shell
```

From that shell, use `pnpm` directly or the supplied shortcuts, including
`devbox run test`, `devbox run check`, and `devbox run simulate`.

## Delivery workflow

The repository is intended to use trunk-based development: `main` is a
protected integration branch, changes arrive through short-lived pull requests,
and GitHub's merge queue creates and validates the queued merge result before
it reaches `main`. Configure this policy in GitHub rather than relying on these
workflow files alone: forbid direct pushes to `main`, require pull requests and
their validation check, then enable the merge queue.

| Trigger                       | Workflow                                               | Purpose                                                                                           |
| ----------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Pull request targeting `main` | [`pr.yml`](.github/workflows/pr.yml)                   | Runs checks, tests, Compose validation, image builds, and the critical dependency audit.          |
| Merge-queue entry             | [`merge-queue.yml`](.github/workflows/merge-queue.yml) | Revalidates the queued merge result and runs the mTLS integration check.                          |
| Push to `main`                | [`post-merge.yml`](.github/workflows/post-merge.yml)   | Revalidates the immutable main commit and contains a non-mutating staging-deployment placeholder. |
| Published GitHub release      | [`release.yml`](.github/workflows/release.yml)         | Revalidates the release and contains a non-mutating publish/deploy placeholder.                   |

The shared implementation is [`validate.yml`](.github/workflows/validate.yml).
The staging and release actions intentionally do not publish or deploy: add
registry, signing, environment, and deployment details only after those target
systems are chosen.

Every pull request targeting `main` runs the shared validation workflow. It
type-checks, lints, checks formatting, runs the test suite, validates both
Compose definitions, builds the service images, and checks production
dependencies for critical advisories.

To simulate the workflows locally, start Docker Desktop and run:

```sh
devbox run act:pr
devbox run act:merge-queue
devbox run act:main
devbox run act:release
devbox run act:mtls
```

The first run downloads the local runner image. The wrapper defaults to an
amd64 runner image for Apple Silicon compatibility and mounts Docker Desktop's
container-compatible socket so workflows can build service images. It is for
trusted local repository code only.

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
BACKEND_TIMEOUT_MS=10000
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

### Optional: provision the Auth0 demo API with Terraform

Use this only when you want Terraform to provision the demonstration API in an
existing Auth0 tenant. The minimal [Auth0 Terraform configuration](infra/auth0/README.md)
creates an RS256 API/resource server and a native application configured for
Postman's Authorization Code with PKCE. It also provisions the API permissions
and Support/Operation/Admin roles used by the backend's optional permissions
mode. It does not create users, connections, or tenant-level credentials.

Before Terraform can plan or apply, manually create the Auth0 tenant and a
Machine-to-Machine application authorised for the Auth0 Management API. Export
that application's `AUTH0_CLIENT_ID` and `AUTH0_CLIENT_SECRET`, then follow the
[Auth0 setup guide](infra/auth0/README.md) to provision resources in that
tenant and copy Terraform's non-secret outputs into the gateway `.env`.

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

### Explore local logs

Start the lightweight Dozzle log viewer in a separate terminal:

```sh
devbox run logs
```

Open [http://localhost:9999](http://localhost:9999) to browse and search the
gateway and backend logs in real time. Dozzle is bound to loopback and filtered
to this project's containers; its container-management actions and shell access
remain disabled. Stop it with:

```sh
devbox run logs:down
```

Dozzle needs read access to the Docker socket to view logs. Keep this
local-only configuration out of deployed environments.

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

### Bypass the gateway in Compose

`bypass:gateway` runs a temporary curl client on the backend's private Docker
network; it does not expose a backend port on the host. It detects the running
backend transport, so the same command works with either simulation mode.

```sh
# Start either `devbox run simulate` or `devbox run simulate:mtls` in another
# terminal first.
devbox run bypass:gateway
devbox run bypass:gateway demo-user
```

| Command                               | HTTP simulation                     | mTLS simulation                   |
| ------------------------------------- | ----------------------------------- | --------------------------------- |
| `devbox run bypass:gateway`           | `403` with `verified_user_required` | Rejected during the TLS handshake |
| `devbox run bypass:gateway demo-user` | `200`                               | Rejected during the TLS handshake |

The second command sends forged `X-Verified-User` and `read:users` permissions
assertions. The mTLS test deliberately supplies the CA certificate but never a
gateway client certificate, so neither request reaches the backend’s HTTP
handler; a curl TLS error followed by `Expected mTLS handshake rejection` is
the successful result.

### Expected failure responses

| Scenario                                                           | Status                      | Boundary that responds                       |
| ------------------------------------------------------------------ | --------------------------- | -------------------------------------------- |
| Missing, malformed, expired, wrong-issuer, or wrong-audience token | `401 Unauthorized`          | Gateway                                      |
| Malformed create/update request                                    | `400 Bad Request`           | Backend                                      |
| Direct backend request without `X-Verified-User`                   | `403 Forbidden`             | Backend                                      |
| Direct backend bypass with a forged identity assertion (mTLS)      | TLS handshake rejected      | Backend mTLS listener                        |
| Unexpected service or upstream failure                             | `500 Internal Server Error` | Service boundary; no stack trace is returned |

## Test with Postman

The repository includes a [Postman collection](<postman/Secure API.postman_collection.json>) for manually exercising the User API through the gateway. It contains requests to list, create, retrieve, update, and delete users at `http://localhost:3000`; start the services before using it.

The collection obtains and stores an Auth0 **access token** using OAuth 2.0 Authorization Code with PKCE, then sends that token as a Bearer token to the gateway. After importing the collection into Postman, open the collection's **Authorization** tab and replace the placeholders with the values for your Auth0 tenant:

- **Authorization URL:** `https://<tenant-domain>/authorize`
- **Access Token URL:** `https://<tenant-domain>/oauth/token`
- **Client ID:** the `postman_demo_client_id` Terraform output
- **Callback URL:** `https://oauth.pstmn.io/v1/callback`
- **Audience:** the `users_api_audience` Terraform output
- **Scope:** `openid profile email`

Choose **Get New Access Token**, sign in as the test user, and use the resulting access token. The gateway must be configured with the matching issuer, JWKS URL, and audience as described in [Configure OIDC](#configure-oidc). The collection intentionally contains neither an access token nor a client secret; do not add either to the exported file.

The saved requests use example user IDs. Create a user first, then replace the IDs in the retrieve, update, and delete requests with the ID returned by the create response. The backend's in-memory data resets when it restarts.

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
- [Deployment security architecture](docs/deployment-security.md)
