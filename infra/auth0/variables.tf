variable "auth0_domain" {
  type        = string
  description = "Existing Auth0 tenant domain without a URL scheme, for example dev-example.au.auth0.com."

  validation {
    condition     = !strcontains(var.auth0_domain, "://") && !strcontains(var.auth0_domain, "/")
    error_message = "auth0_domain must be a tenant domain without https:// or a path."
  }
}

variable "users_api_name" {
  type        = string
  description = "Display name for the Auth0 API/resource server."
  default     = "Secure Entry Users API"
}

variable "users_api_identifier" {
  type        = string
  description = "Audience identifier issued in access tokens for the Users API."
  default     = "https://secure-entry-users-api"
}

variable "postman_demo_client_name" {
  type        = string
  description = "Display name for the public native application used for local/Postman demonstrations."
  default     = "Secure Entry Postman Client"
}
