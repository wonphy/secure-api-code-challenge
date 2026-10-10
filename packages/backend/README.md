# Backend User API

The backend is the private User API for the Secure Entry proof of concept. It
stores users in memory and exposes CRUD operations for `id`, `name`, and
`email`.

See [SPEC.md](SPEC.md) for the backend trust, authorization, data, and error
contracts.

## Responsibilities

- Serves the `/api/users` CRUD API and `/health` probe.
- Trusts the gateway's `X-Verified-User` identity assertion; it does **not**
  validate JWTs.
- Requires a gateway-injected `X-Verified-User` assertion. Optional
  route-level permission enforcement can use the gateway-injected
  `X-Verified-User-Permissions` JSON array.
- Maintains a normalized, unique email index alongside its in-memory user
  store.
- Emits JSON structured request and error logs without user data, identity
  assertions, request bodies, permission payloads, or query values.

The service must be private to the gateway in deployment. A header alone is
not proof of identity if a client can reach the backend directly.

## Configuration

| Variable             | Default         | Description                                                        |
| -------------------- | --------------- | ------------------------------------------------------------------ |
| `PORT`               | `3001`          | HTTP listening port.                                               |
| `LOG_LEVEL`          | `info`          | Minimum structured log level: `debug`, `info`, `warn`, or `error`. |
| `AUTHORIZATION_MODE` | `identity-only` | `identity-only` or opt-in `permissions` authorization.             |

## API and authorization

All `/api/users` routes require `X-Verified-User`; this is the default
`identity-only` mode and matches the challenge. Set
`AUTHORIZATION_MODE=permissions` only when the IdP and gateway are configured
to supply the verified `X-Verified-User-Permissions` claim. In that mode, the
gateway removes caller-supplied values and each route requires the listed
permission.

| Method   | Path             | Permission    |
| -------- | ---------------- | ------------- |
| `GET`    | `/api/users`     | `read:users`  |
| `GET`    | `/api/users/:id` | `read:user`   |
| `POST`   | `/api/users`     | `create:user` |
| `PUT`    | `/api/users/:id` | `update:user` |
| `DELETE` | `/api/users/:id` | `delete:user` |

`POST` requires both `name` and `email`. `PUT` accepts either field or both.
Emails are trimmed, normalized to lowercase, and unique. The user list is
in-memory only, so it is reset when the service restarts.

## Structure

```text
src/
├── app.ts                    # Express application composition
├── server.ts                 # Configuration loading and listener startup
├── config/                   # Environment validation
├── errors/                   # Safe JSON error responses
├── logging/                  # Structured logger and request logging
├── trust/                    # Gateway identity and permission assertions
└── users/                    # User model, validation, storage, and routes
```

The root README contains development, deployment, and test instructions.
