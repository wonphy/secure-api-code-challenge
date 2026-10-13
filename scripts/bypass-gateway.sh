#!/usr/bin/env sh
set -eu

usage() {
  echo "Usage: devbox run bypass:gateway [forged-user-id]" >&2
  exit 2
}

case "$#" in
  0) verified_user="" ;;
  1) verified_user=$1 ;;
  *) usage ;;
esac

if ! docker compose ps --services --status running | grep -qx backend; then
  echo "The HTTP backend is not running. Start it with: devbox run simulate" >&2
  exit 1
fi

# The backend is intentionally not published to the host. Resolve its sole,
# private Compose network rather than assuming Compose's project-derived name.
backend_container=$(docker compose ps -q backend)
backend_tls_mode=$(docker inspect \
  --format '{{range .Config.Env}}{{println .}}{{end}}' "$backend_container" \
  | sed -n 's/^BACKEND_TLS_MODE=//p')
private_network=$(docker inspect \
  --format '{{range $name, $_ := .NetworkSettings.Networks}}{{println $name}}{{end}}' \
  "$backend_container")

if [ "$backend_tls_mode" = "mtls" ]; then
  certificate_directory="$(pwd -P)/.local/mtls"
  if [ ! -f "$certificate_directory/ca.crt" ]; then
    echo "Missing $certificate_directory/ca.crt. Start the mTLS simulation first." >&2
    exit 1
  fi
  protocol=https
  tls_arguments="--cacert /run/mtls/ca.crt"
  certificate_mount="-v $certificate_directory:/run/mtls:ro"
else
  protocol=http
  tls_arguments=""
  certificate_mount=""
fi

request_backend() {
  if [ -n "$verified_user" ]; then
    printf '\n== Direct request with forged X-Verified-User: %s ==\n' "$verified_user"
  else
    printf '\n== Direct request without X-Verified-User ==\n'
  fi

  set +e
  # No client certificate is ever supplied. In mTLS mode, both calls must
  # fail during TLS negotiation, before the backend can trust any header.
  if [ -n "$verified_user" ]; then
    docker run --rm --network "$private_network" $certificate_mount \
      curlimages/curl --silent --show-error -i $tls_arguments \
      -H "X-Verified-User: $verified_user" \
      -H 'X-Verified-User-Permissions: ["read:users"]' \
      "$protocol://backend:3001/api/users"
  else
    docker run --rm --network "$private_network" $certificate_mount \
      curlimages/curl --silent --show-error -i $tls_arguments \
      "$protocol://backend:3001/api/users"
  fi
  status=$?
  set -e

  if [ "$backend_tls_mode" = "mtls" ]; then
    case "$status" in
      35|56) echo "Expected mTLS handshake rejection (curl exit $status)." ;;
      0) echo "Unexpected HTTP response: untrusted client reached the backend." >&2; exit 1 ;;
      *) echo "Unexpected curl failure (exit $status)." >&2; exit 1 ;;
    esac
  elif [ "$status" -ne 0 ]; then
    exit "$status"
  fi
}

request_backend
