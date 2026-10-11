output "users_api_audience" {
  description = "Set this value as JWT_AUDIENCE in packages/gateway/.env."
  value       = auth0_resource_server.users_api.identifier
}

output "postman_demo_client_id" {
  description = "Public Auth0 client ID for the Postman Authorization Code with PKCE flow."
  value       = auth0_client.postman_demo.client_id
}

output "jwt_issuer" {
  description = "Set this value as JWT_ISSUER in packages/gateway/.env."
  value       = "https://${var.auth0_domain}/"
}

output "jwks_url" {
  description = "Set this value as JWT_JWKS_URL in packages/gateway/.env."
  value       = "https://${var.auth0_domain}/.well-known/jwks.json"
}

output "roles" {
  description = "Roles to assign manually to the Auth0 test user."
  value = {
    admin     = auth0_role.admin.name
    operation = auth0_role.operation.name
    support   = auth0_role.support.name
  }
}
