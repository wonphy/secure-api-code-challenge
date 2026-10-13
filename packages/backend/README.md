# Backend User API

The backend is the private User API for the Secure Entry proof of concept. It
stores users in memory and exposes CRUD operations for `id`, `name`, and
`email`.

See [SPEC.md](SPEC.md) for the backend trust, authorization, data, and error
contracts.

## Responsibilities

- Serves the `/api/users` CRUD API plus unauthenticated `/health` and `/ready`
  probes.
- Trusts the gateway's `X-Verified-User` identity assertion; it does **not**
  validate JWTs.
- Requires a gateway-injected `X-Verified-User` assertion. Optional
  route-level permission enforcement can use the gateway-injected
  `X-Verified-User-Permissions` JSON array.
- Maintains a normalized, unique email index alongside its in-memory user
  store.
- Emits JSON structured request and error logs without user data, identity
  assertions, request bodies, permission payloads, or query values.
- Optionally requires a mutual-TLS client certificate with the expected gateway
  common name before it evaluates any API assertion headers.

The service must be private to the gateway in deployment. A header alone is
not proof of identity if a client can reach the backend directly.

## Configuration

| Variable                 | Default         | Description                                                        |
| ------------------------ | --------------- | ------------------------------------------------------------------ |
| `PORT`                   | `3001`          | HTTP listening port.                                               |
| `LOG_LEVEL`              | `info`          | Minimum structured log level: `debug`, `info`, `warn`, or `error`. |
| `AUTHORIZATION_MODE`     | `identity-only` | `identity-only` or opt-in `permissions` authorization.             |
| `BACKEND_TLS_MODE`       | `http`          | `http`, or `mtls` to require a gateway client certificate.         |
| `TLS_CA_CERT_PATH`       | —               | CA certificate path; required for `mtls`.                          |
| `TLS_SERVER_CERT_PATH`   | —               | Backend server certificate path; required for `mtls`.              |
| `TLS_SERVER_KEY_PATH`    | —               | Backend server private-key path; required for `mtls`.              |
| `TLS_EXPECTED_CLIENT_CN` | `gateway`       | Required gateway client-certificate common name in `mtls` mode.    |

`BACKEND_TLS_MODE=mtls` requires all three TLS file paths. The Compose mTLS
overlay supplies these values and changes the backend listener to HTTPS.

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
├── app.ts                      # Express route and middleware composition
├── server.ts                   # Startup, configuration loading, and listener
├── config/
│   └── environment.ts           # Environment validation and configuration model
├── errors/
│   └── http-errors.ts           # Safe JSON error and unknown-route responses
├── logging/
│   ├── backend-logger.ts        # Structured logger and log filtering
│   └── request-logger.ts        # Request-completion logging
├── trust/
│   ├── mutual-tls.ts            # Expected gateway client-certificate guard
│   ├── permission-middleware.ts # Optional route permission enforcement
│   └── verified-user.ts         # Gateway identity-assertion guard
└── users/
    ├── user-store.ts            # In-memory user and normalized-email indexes
    ├── user-validation.ts       # Request validation and normalization
    ├── user.ts                  # User data model
    └── users-router.ts          # CRUD routes and authorization composition
```

The root README contains development, deployment, and test instructions.
