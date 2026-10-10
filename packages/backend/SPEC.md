# Backend Specification

## Purpose

The backend is the private resource server for the User API. It owns user
data, applies user-domain authorization, and returns safe HTTP responses. The
proof of concept stores data in memory.

The backend deliberately does **not** validate JWTs. Token verification is the
gateway's responsibility.

## System principals and trust boundary

| Principal     | Responsibility                                                       | Trust level at the backend                      |
| ------------- | -------------------------------------------------------------------- | ----------------------------------------------- |
| API client    | Sends requests and bearer tokens to the gateway.                     | Untrusted; must not reach the backend directly. |
| Gateway       | Validates OIDC tokens and injects verified identity and permissions. | Trusted assertion producer.                     |
| Backend       | Enforces permissions and manages users.                              | Trusted resource server.                        |
| OIDC provider | Issues tokens and hosts signing keys.                                | Used by the gateway only.                       |

```text
API client -> Gateway -> Backend (private network)
              validates JWT    authorizes user operations
              injects headers
```

The backend must be private to the gateway. Its header checks are valid only
when a client cannot open a direct connection and forge gateway assertion
headers. Network segmentation is mandatory; mutual TLS is recommended for a
production service-to-service boundary.

## Gateway assertion contract

The gateway must remove any caller-supplied versions of these headers, validate
the access token, then inject:

| Header                        | Required value                             | Backend use                                                   |
| ----------------------------- | ------------------------------------------ | ------------------------------------------------------------- |
| `X-Verified-User`             | Non-empty verified subject identifier.     | Establishes the authenticated principal for protected routes. |
| `X-Verified-User-Permissions` | JSON string array of verified permissions. | Route-level authorization.                                    |

The backend rejects a protected request without `X-Verified-User` with `403`.
By default (`AUTHORIZATION_MODE=identity-only`), that assertion is sufficient,
as required by the challenge. In opt-in `permissions` mode, malformed, absent,
or insufficient permissions fail closed with `403`. It does not parse, retain,
or validate an `Authorization` bearer token.

## Authorization contract

| Method   | Path             | Required permission |
| -------- | ---------------- | ------------------- |
| `GET`    | `/api/users`     | `read:users`        |
| `GET`    | `/api/users/:id` | `read:user`         |
| `POST`   | `/api/users`     | `create:user`       |
| `PUT`    | `/api/users/:id` | `update:user`       |
| `DELETE` | `/api/users/:id` | `delete:user`       |

Authorization is Express route middleware. The identity guard executes before
the router. The matching permission guard executes before each route handler
only in `permissions` mode.

## User data contract

```ts
interface User {
  id: string;
  name: string;
  email: string;
}
```

- `id` is a server-generated UUID and primary key.
- `name` and `email` must be non-empty strings after trimming.
- `email` is normalized to lowercase and unique across the user store.
- `POST` requires both `name` and `email`.
- `PUT` is a partial update and requires at least one of `name` or `email`.
- Duplicate creates or conflicting email updates return `409`.

The in-memory `Map` is the source of truth for users. A secondary email-to-ID
index enforces uniqueness efficiently. Both are cleared on restart; this is
not a persistent datastore design.

## HTTP response policy

| Scenario                                                    | Response                         |
| ----------------------------------------------------------- | -------------------------------- |
| Health probe                                                | `200` JSON service status        |
| Successful create                                           | `201` JSON user                  |
| Successful delete                                           | `204` with no body               |
| Invalid JSON or invalid user input                          | `400` JSON error                 |
| Missing identity assertion                                  | `403` `verified_user_required`   |
| Malformed or insufficient permissions in `permissions` mode | `403` `insufficient_permissions` |
| User does not exist                                         | `404` `user_not_found`           |
| Unknown backend route                                       | `404` `not_found`                |
| Duplicate normalized email                                  | `409` `email_already_exists`     |
| Unexpected failure                                          | `500` `internal_server_error`    |

`401` is produced by the gateway before a request reaches the backend. No
client response may contain a stack trace, raw exception message, or other
implementation details.

## Logging policy

The backend writes JSON structured logs with `timestamp` and `level`.
Request-completion events contain the HTTP method, path without query string,
source IP, status code, and duration. They do not contain names, emails,
gateway identity assertions, permission payloads, request bodies, or query
values.

Unexpected failures are logged with the stable `unexpected_error` category.
Exception messages and stack traces are not included in API responses. Log
levels are configured by `LOG_LEVEL`: `debug`, `info`, `warn`, or `error`.

## Configuration contract

| Variable             | Requirement                                           |
| -------------------- | ----------------------------------------------------- |
| `PORT`               | Integer from `0` through `65535`; defaults to `3001`. |
| `LOG_LEVEL`          | One of the supported levels; defaults to `info`.      |
| `AUTHORIZATION_MODE` | `identity-only` (default) or opt-in `permissions`.    |

## Review checklist

- [ ] The backend is network-private and only accepts traffic from the gateway.
- [ ] The gateway strips caller identity/permission headers before injecting its assertions.
- [ ] The backend has no JWT validation code or OIDC dependency.
- [ ] Every protected route requires a verified identity assertion.
- [ ] In `permissions` mode, every route has permission middleware that fails closed.
- [ ] Email normalization and uniqueness apply on both create and update.
- [ ] Error responses are JSON and never disclose exception details.
- [ ] Logs contain request context but no name, email, token, identity assertion, permission payload, query value, or raw exception detail.
- [ ] Tests cover the trust boundary, permissions, CRUD behavior, validation, conflicts, logging, and safe errors.
