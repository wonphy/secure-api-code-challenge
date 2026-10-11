# Auth0 Terraform setup

This directory manages only the Auth0 resources needed to demonstrate Secure
Entry:

- an RS256 API/resource server, whose identifier becomes the access-token
  audience, including the API permissions used by the backend;
- a public native application for Postman's Authorization Code with PKCE flow;
- a client grant authorizing that application to request user access tokens for
  the User API; and
- three roles with API permissions: `secure-entry-support`,
  `secure-entry-operation`, and `secure-entry-admin`.

It deliberately does **not** create an Auth0 tenant, a Terraform management
client, a database connection, or a user. The tenant and management client are
a bootstrap prerequisite: Terraform needs their credentials to plan and
provision resources in that tenant. Create the tenant and a test user manually
in Auth0 first.

## One-time Auth0 tenant setup

1. Create or select an Auth0 developer tenant.
2. Create a Machine-to-Machine application for Terraform in the Auth0
   dashboard. Authorise it against the **Auth0 Management API**, then retain
   its client ID and client secret locally for `AUTH0_CLIENT_ID` and
   `AUTH0_CLIENT_SECRET`.
3. Grant that management application the least-privilege lifecycle scopes for
   the resources in this directory:

   ```text
   create:clients, read:clients, update:clients, delete:clients
   create:resource_servers, read:resource_servers,
   update:resource_servers, delete:resource_servers
   create:client_grants, read:client_grants,
   update:client_grants, delete:client_grants
   create:roles, read:roles, update:roles, delete:roles
   ```

4. Create a test user using the tenant's database connection. Terraform does
   not manage user credentials for this proof of concept.

## Provision the demo resources

Enter the Devbox shell from the repository root so the pinned Terraform CLI is
available. Export the management application's credentials; do not put them in
Terraform files or commit them.

```sh
devbox shell
export AUTH0_DOMAIN='dev-your-tenant.au.auth0.com'
export AUTH0_CLIENT_ID='<Terraform management application client ID>'
export AUTH0_CLIENT_SECRET='<Terraform management application client secret>'

terraform -chdir=infra/auth0 init
```

Copy the supplied example before planning. Terraform automatically loads a file
named `terraform.tfvars` from the `infra/auth0` configuration directory:

```sh
cp infra/auth0/terraform.tfvars.example infra/auth0/terraform.tfvars
# Edit infra/auth0/terraform.tfvars with your tenant values.

terraform -chdir=infra/auth0 plan
terraform -chdir=infra/auth0 apply
```

The local `.tfvars` file is ignored by Git. Do not add a `-var` argument for a
value already set in this file: command-line `-var` values override values in
`terraform.tfvars`. If you intentionally do not use a variable file, supply
every required value with `-var` or `TF_VAR_<name>` environment variables.

The Auth0 provider reads `AUTH0_CLIENT_ID` and `AUTH0_CLIENT_SECRET` from the
environment. The provider configuration receives the existing tenant domain
through `auth0_domain`.

## Configure the gateway

After apply, read the non-secret outputs:

```sh
terraform -chdir=infra/auth0 output
```

Set the matching values in `packages/gateway/.env`:

```dotenv
JWT_JWKS_URL=<jwks_url output>
JWT_ISSUER=<issuer output>
JWT_AUDIENCE=<users_api_audience output>
JWT_ALLOWED_ALGORITHMS=RS256
```

For Postman, configure OAuth 2.0 as Authorization Code (With PKCE), with:

- Authorization URL: `https://<tenant-domain>/authorize`
- Access Token URL: `https://<tenant-domain>/oauth/token`
- Client ID: `postman_demo_client_id` output
- Callback URL: `https://oauth.pstmn.io/v1/callback`
- Audience: `users_api_audience` output
- Scope: `openid profile email`

Sign in as the manually created test user, then use the resulting **access
token** with the gateway requests in the root README. Do not use the ID token.
Assign the user a role and obtain a new token before testing permission-based
authorization; API permissions come from the user's roles, not Postman's
requested OAuth scope.

## Roles and API permissions

The provisioned API uses Auth0 Core RBAC and includes the `permissions` claim
in access tokens. The permissions match the backend's optional
`AUTHORIZATION_MODE=permissions` checks:

| Permission    | API operation           |
| ------------- | ----------------------- |
| `read:users`  | `GET /api/users`        |
| `read:user`   | `GET /api/users/:id`    |
| `create:user` | `POST /api/users`       |
| `update:user` | `PUT /api/users/:id`    |
| `delete:user` | `DELETE /api/users/:id` |

The roles deliberately do not create or manage users:

| Role                     | Granted permissions                                          |
| ------------------------ | ------------------------------------------------------------ |
| `secure-entry-support`   | `read:users`, `read:user`                                    |
| `secure-entry-operation` | All support permissions plus `create:user` and `update:user` |
| `secure-entry-admin`     | All User API permissions                                     |

After `terraform apply`, assign one of these roles to the manually created
test user in **Auth0 Dashboard → User Management → Users → _user_ → Roles**.
Request a new access token after changing a role; existing tokens retain their
claims until expiry.

To enforce these permissions in the backend rather than only requiring a
verified identity, set the following in `packages/backend/.env` before starting
the backend:

```dotenv
AUTHORIZATION_MODE=permissions
```

The gateway passes the verified Auth0 `permissions` claim as its trusted
`X-Verified-User-Permissions` assertion; clients cannot inject it themselves.

## State and cleanup

The default Terraform backend writes state locally. State can contain resource
identifiers and must not be committed; `.gitignore` excludes it. For a shared
or long-lived environment, configure a secured remote backend before running
`apply`.

Remove only the demonstration application and API when finished:

```sh
terraform -chdir=infra/auth0 destroy
```
