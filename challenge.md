# Secure API Code Challenge

## Purpose

Code challenge for a **Senior CIAM Engineer – NDIA** to demonstrate:

- Engineering / coding skills
- IAM experience

## Problem: "Secure Entry" Gateway PoC

The team is moving toward a **Zero Trust architecture**.

The goal is to ensure that **no traffic reaches the backend compute layer unless it has been pre-verified by a central API Gateway**.

To reduce compute cost and latency:

- The Gateway is responsible for authentication.
- The Backend relies entirely on the Gateway for authentication.
- The Backend **must not perform its own JWT validation**.

---

# Functional Requirements

## A. Identity Provider (OIDC)

1. Configure a free developer tenant with an OIDC-compliant provider, e.g.:
   - Auth0
   - Okta
   - Amazon Cognito

2. Create a user in the tenant for authentication testing.

---

## B. Gateway Service — Node.js

The Gateway acts as a **reverse proxy**.

### Request Handling

Listen for incoming requests to:

    /api/users

Check:

    Authorization: Bearer <JWT>

### JWT Validation

The Gateway must:

- Verify the JWT signature using the IdP's public keys.
- Verify:
  - `exp` — expiration
  - `iss` — issuer
  - `aud` — audience

### JWKS Caching

Cache the IdP's public keys (JWKS) locally.

**Do not fetch JWKS from the IdP for every request.**

### Policy Enforcement

If authentication fails:

    401 Unauthorized

The request must **not** be forwarded to the Backend.

If authentication succeeds:

1. Extract the user's:
   - `sub`, or
   - email

2. Inject:

   X-Verified-User: <user-id>

3. Forward the request to the Backend.

---

## C. Backend Service — User API

Implement a simple REST API.

Node.js / Express is preferred.

Use an **in-memory list of users**.

### Endpoints

    GET /api/users
    GET /api/users/:id
    POST /api/users
    PUT /api/users/:id
    DELETE /api/users/:id

### Create User

Request body:

    {
      "name": "...",
      "email": "..."
    }

### Backend Authentication Rule

The Backend **must not validate JWTs**.

Instead, it checks for:

    X-Verified-User

If present:

    Process the request.

If missing:

    403 Forbidden

---

# Non-Functional Requirements

## Structured Logging

Implement JSON-structured logging at the Gateway.

Logs must include:

- Timestamp
- HTTP method
- Path
- Source IP
- User ID, if verified

## Error Handling

Use clean HTTP status codes:

- `400` — Bad Request
- `401` — Unauthorized
- `403` — Forbidden
- `500` — Internal Server Error

Never expose stack traces to clients.

---

# Deliverables

Provide a GitHub repository containing:

## Project Structure

Clearly separated:

    gateway/
    backend/

## Documentation

Provide clear instructions for running:

- Gateway
- Backend

## Tests

### JWT Validation

Test JWT validation logic while **mocking the OIDC provider**.

### Zero Trust Flow

Demonstrate at minimum:

1. Request without a token → blocked by Gateway.
2. Request bypassing Gateway → blocked by Backend.

## README

Include:

- Simple visual of the traffic flow.
- OIDC credential setup instructions.
- `.env` example.
- Commands for testing success and failure scenarios.

---

# Evaluation Criteria

The solution will be evaluated on:

1. Clean separation of:
   - Authentication
   - Authorization
   - Proxying

2. Handling of sensitive data and error messages.

3. Logging quality and system **debuggability**.

4. Modern JavaScript / TypeScript practices.

5. Linting.

6. Project structure.
