import express from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { createRemoteJWKSet, jwtVerify } from "jose";

const app = express();
const backendUrl = process.env.BACKEND_URL ?? "http://localhost:3001";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);

const issuer = process.env.JWT_ISSUER;
const audience = process.env.JWT_AUDIENCE;
const jwksUrl = process.env.JWT_JWKS_URL;
const developmentToken = process.env.DEV_GATEWAY_TOKEN;

const jwks = jwksUrl ? createRemoteJWKSet(new URL(jwksUrl)) : undefined;
const jwtSettingsProvided = Boolean(jwksUrl || issuer || audience);
const jwtAuthenticationConfigured = Boolean(jwks && issuer && audience);

app.get("/health", (_request, response) => {
  response.status(200).json({ service: "gateway", status: "ok" });
});

app.use("/api/users", async (request, response, next) => {
  const token = request.header("authorization")?.replace(/^Bearer\s+/i, "");

  if (!token) {
    response.status(401).json({ error: "missing bearer token" });
    return;
  }

  try {
    if (jwtSettingsProvided && !jwtAuthenticationConfigured) {
      response
        .status(503)
        .json({ error: "JWT authentication is misconfigured" });
      return;
    }

    if (jwtAuthenticationConfigured && jwks && issuer && audience) {
      await jwtVerify(token, jwks, { issuer, audience });
    } else if (!developmentToken || token !== developmentToken) {
      response
        .status(503)
        .json({ error: "gateway authentication is not configured" });
      return;
    }

    next();
  } catch {
    response.status(401).json({ error: "invalid bearer token" });
  }
});

app.use(
  createProxyMiddleware({
    pathFilter: "/api/users",
    target: backendUrl,
    changeOrigin: true,
  }),
);

app.listen(port, () => {
  console.log(`Gateway listening on http://localhost:${port}`);
});
