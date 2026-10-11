terraform {
  required_version = ">= 1.8.0, < 2.0.0"

  required_providers {
    auth0 = {
      source  = "auth0/auth0"
      version = "~> 1.9"
    }
  }
}
