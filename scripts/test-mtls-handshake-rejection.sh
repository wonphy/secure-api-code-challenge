#!/usr/bin/env sh
set -eu

# This test needs the mTLS Compose stack started by `devbox run simulate:mtls`.
if ! docker compose -f compose.yaml -f compose.mtls.yaml ps --services --status running | grep -qx gateway; then
  echo "The mTLS gateway is not running. Start it with: devbox run simulate:mtls" >&2
  exit 1
fi

# Connect from the Compose network with the trusted CA but no client certificate.
# A response would be a failure: the backend must reject the TLS handshake first.
docker compose -f compose.yaml -f compose.mtls.yaml exec -T gateway \
  node --input-type=commonjs -e '
const https = require("node:https");
const fs = require("node:fs");

const request = https.get({
  hostname: "backend",
  port: 3001,
  path: "/api/users",
  ca: fs.readFileSync("/run/mtls/ca.crt"),
  servername: "backend",
}, (response) => {
  console.error(`Unexpected HTTP response: ${response.statusCode}`);
  response.resume();
  process.exitCode = 1;
});

request.on("error", (error) => {
  const expectedCodes = new Set([
    "ERR_SSL_TLSV13_ALERT_CERTIFICATE_REQUIRED",
    "ERR_SSL_SSLV3_ALERT_HANDSHAKE_FAILURE",
  ]);
  if (
    !expectedCodes.has(error.code) &&
    !/alert certificate required|alert handshake failure/i.test(error.message)
  ) {
    console.error(`Unexpected connection error: ${error.code ?? error.message}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Expected mTLS handshake rejection: ${error.code ?? error.message}`);
});
'
