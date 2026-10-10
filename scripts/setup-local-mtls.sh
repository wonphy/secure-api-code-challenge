#!/usr/bin/env sh
set -eu

# Local-only CA and workload certificates for the Compose mTLS demonstration.
CERTIFICATE_DIRECTORY=".local/mtls"
REQUIRED_FILES="ca.crt ca.key backend.crt backend.key gateway.crt gateway.key"
FORCE=false

if [ "${1:-}" = "--force" ]; then FORCE=true; elif [ "$#" -ne 0 ]; then
  echo "Usage: $0 [--force]" >&2; exit 1
fi
command -v openssl >/dev/null 2>&1 || { echo "OpenSSL is required." >&2; exit 1; }

present=0
for file in $REQUIRED_FILES; do [ -f "$CERTIFICATE_DIRECTORY/$file" ] && present=$((present + 1)); done
if [ "$present" -eq 6 ] && [ "$FORCE" = false ]; then
  # Avoid silently rotating a certificate set that a running Compose stack uses.
  echo "Reusing local mTLS certificates in $CERTIFICATE_DIRECTORY."; exit 0
fi
if [ "$present" -gt 0 ] && [ "$FORCE" = false ]; then
  echo "Incomplete certificate set. Remove $CERTIFICATE_DIRECTORY or use --force." >&2; exit 1
fi

mkdir -p "$CERTIFICATE_DIRECTORY"
if [ "$FORCE" = true ]; then rm -f "$CERTIFICATE_DIRECTORY"/*; fi
# Private keys created below are owner-readable only.
umask 077

# The CA key stays on the host; only its public certificate is mounted in containers.
openssl genrsa -out "$CERTIFICATE_DIRECTORY/ca.key" 4096
openssl req -x509 -new -sha256 -days 30 -key "$CERTIFICATE_DIRECTORY/ca.key" -out "$CERTIFICATE_DIRECTORY/ca.crt" -subj "/CN=secure-api-local-ca"

# `DNS:backend` matches the Docker Compose service hostname used by the gateway.
openssl genrsa -out "$CERTIFICATE_DIRECTORY/backend.key" 2048
openssl req -new -key "$CERTIFICATE_DIRECTORY/backend.key" -out "$CERTIFICATE_DIRECTORY/backend.csr" -subj "/CN=backend"
printf '%s\n' "subjectAltName=DNS:backend" "extendedKeyUsage=serverAuth" "keyUsage=digitalSignature,keyEncipherment" >"$CERTIFICATE_DIRECTORY/backend.ext"
openssl x509 -req -sha256 -days 30 -in "$CERTIFICATE_DIRECTORY/backend.csr" -CA "$CERTIFICATE_DIRECTORY/ca.crt" -CAkey "$CERTIFICATE_DIRECTORY/ca.key" -CAcreateserial -out "$CERTIFICATE_DIRECTORY/backend.crt" -extfile "$CERTIFICATE_DIRECTORY/backend.ext"

# This client certificate identifies the gateway to the backend.
openssl genrsa -out "$CERTIFICATE_DIRECTORY/gateway.key" 2048
openssl req -new -key "$CERTIFICATE_DIRECTORY/gateway.key" -out "$CERTIFICATE_DIRECTORY/gateway.csr" -subj "/CN=gateway"
printf '%s\n' "subjectAltName=DNS:gateway" "extendedKeyUsage=clientAuth" "keyUsage=digitalSignature,keyEncipherment" >"$CERTIFICATE_DIRECTORY/gateway.ext"
openssl x509 -req -sha256 -days 30 -in "$CERTIFICATE_DIRECTORY/gateway.csr" -CA "$CERTIFICATE_DIRECTORY/ca.crt" -CAkey "$CERTIFICATE_DIRECTORY/ca.key" -CAcreateserial -out "$CERTIFICATE_DIRECTORY/gateway.crt" -extfile "$CERTIFICATE_DIRECTORY/gateway.ext"

# Keep only the certificate material consumed by the Compose overlay.
rm -f "$CERTIFICATE_DIRECTORY"/*.csr "$CERTIFICATE_DIRECTORY"/*.ext "$CERTIFICATE_DIRECTORY"/*.srl
chmod 600 "$CERTIFICATE_DIRECTORY"/*.key
echo "Created local mTLS certificates in $CERTIFICATE_DIRECTORY."
