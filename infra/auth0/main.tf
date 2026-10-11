provider "auth0" {
  domain = var.auth0_domain
}

# The API is the audience the gateway expects in a user access token.
resource "auth0_resource_server" "users_api" {
  name             = var.users_api_name
  identifier       = var.users_api_identifier
  signing_alg      = "RS256"
  enforce_policies = true

  # Includes the permissions claim in access tokens after Auth0 evaluates roles.
  token_dialect = "access_token_authz"
}

resource "auth0_resource_server_scopes" "users_api" {
  resource_server_identifier = auth0_resource_server.users_api.identifier

  scopes {
    name        = "read:users"
    description = "List users."
  }

  scopes {
    name        = "read:user"
    description = "Get one user."
  }

  scopes {
    name        = "create:user"
    description = "Create a user."
  }

  scopes {
    name        = "update:user"
    description = "Update a user."
  }

  scopes {
    name        = "delete:user"
    description = "Delete a user."
  }
}

# A public native application keeps the demo simple: Postman can use
# Authorization Code with PKCE and no client secret is stored in this project.
resource "auth0_client" "postman_demo" {
  name            = var.postman_demo_client_name
  description     = "Secure Entry Postman demo client managed by Terraform."
  app_type        = "native"
  oidc_conformant = true

  callbacks = ["https://oauth.pstmn.io/v1/callback"]
}

# Authorize the Postman application to request an access token for this API.
# User permissions are granted by Auth0 roles below, not by this client grant.
resource "auth0_client_grant" "postman_demo_users_api" {
  client_id        = auth0_client.postman_demo.client_id
  audience         = auth0_resource_server.users_api.identifier
  subject_type     = "user"
  allow_all_scopes = true

  depends_on = [auth0_resource_server_scopes.users_api]
}

resource "auth0_role" "admin" {
  name        = "secure-entry-admin"
  description = "Full access to the Secure Entry."
}

resource "auth0_role" "operation" {
  name        = "secure-entry-operation"
  description = "Read and write access to the Secure Entry."
}

resource "auth0_role" "support" {
  name        = "secure-entry-support"
  description = "Read-only access to the Secure Entry."
}

resource "auth0_role_permissions" "support" {
  role_id = auth0_role.support.id

  permissions {
    name                       = "read:users"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  permissions {
    name                       = "read:user"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  depends_on = [auth0_resource_server_scopes.users_api]
}

# Permissions are reusable: operations includes the support read permissions.
resource "auth0_role_permissions" "operation" {
  role_id = auth0_role.operation.id

  permissions {
    name                       = "read:users"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  permissions {
    name                       = "read:user"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  permissions {
    name                       = "create:user"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  permissions {
    name                       = "update:user"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  depends_on = [auth0_resource_server_scopes.users_api]
}

# Administrators receive the complete User API permission set.
resource "auth0_role_permissions" "admin" {
  role_id = auth0_role.admin.id

  permissions {
    name                       = "read:users"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  permissions {
    name                       = "read:user"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  permissions {
    name                       = "create:user"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  permissions {
    name                       = "update:user"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  permissions {
    name                       = "delete:user"
    resource_server_identifier = auth0_resource_server.users_api.identifier
  }

  depends_on = [auth0_resource_server_scopes.users_api]
}
