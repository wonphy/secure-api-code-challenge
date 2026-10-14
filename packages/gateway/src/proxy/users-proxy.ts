import type express from "express";
import { readFileSync } from "node:fs";
import { Agent } from "node:https";
import {
  type ClientRequest,
  type IncomingMessage,
  ServerResponse,
} from "node:http";
import type { Socket } from "node:net";
import { createProxyMiddleware } from "http-proxy-middleware";
import {
  VERIFIED_USER_HEADER,
  VERIFIED_USER_PERMISSIONS_HEADER,
} from "@secure-api/contracts/gateway-assertions";
import type { GatewayLogger } from "../logging/gateway-logger.js";
import type { BackendMutualTlsConfiguration } from "../config/environment.js";

export function createUsersProxy(
  backendUrl: string,
  logger: GatewayLogger,
  backendMutualTls?: BackendMutualTlsConfiguration,
  backendTimeoutMs = 10_000,
): express.RequestHandler {
  const agent = backendMutualTls
    ? createMutualTlsAgent(backendUrl, backendMutualTls)
    : undefined;

  return createProxyMiddleware<express.Request, express.Response>({
    agent,
    pathFilter: "/api/users",
    proxyTimeout: backendTimeoutMs,
    target: backendUrl,
    changeOrigin: true,
    selfHandleResponse: true,
    on: {
      error: (
        _error: Error,
        request: express.Request,
        response: express.Response | Socket,
      ) => {
        if (!(response instanceof ServerResponse) || response.headersSent) {
          return;
        }

        logger.error({
          event: "proxy_request_failed",
          method: request.method,
          path: request.originalUrl.split("?", 1)[0],
          sourceIp: request.ip,
          statusCode: 500,
          errorCategory: "backend_connection_failed",
        });
        response.writeHead(500, { "content-type": "application/json" });
        response.end(JSON.stringify({ error: "internal_server_error" }));
      },
      proxyRes: (
        backendResponse: IncomingMessage,
        _request: express.Request,
        response: express.Response,
      ) => {
        if (backendResponse.statusCode && backendResponse.statusCode >= 500) {
          // Do not forward a backend error body, which might include implementation details.
          backendResponse.resume();
          response.status(500).json({ error: "internal_server_error" });
          return;
        }

        response.writeHead(
          backendResponse.statusCode ?? 502,
          backendResponse.headers,
        );
        backendResponse.pipe(response);
      },
      proxyReq: (
        proxyRequest: ClientRequest,
        _request: express.Request,
        response: express.Response,
      ) => {
        const { verifiedUser, verifiedUserPermissions } = response.locals;

        // Make these headers gateway assertions: discard caller credentials and spoofed values.
        proxyRequest.removeHeader("authorization");
        proxyRequest.removeHeader(VERIFIED_USER_HEADER);
        proxyRequest.removeHeader(VERIFIED_USER_PERMISSIONS_HEADER);

        if (!verifiedUser) {
          proxyRequest.destroy(
            new Error("verified identity is missing at the proxy boundary"),
          );
          return;
        }

        proxyRequest.setHeader(VERIFIED_USER_HEADER, verifiedUser);
        proxyRequest.setHeader(
          VERIFIED_USER_PERMISSIONS_HEADER,
          JSON.stringify(verifiedUserPermissions),
        );
      },
    },
  });
}

function createMutualTlsAgent(
  backendUrl: string,
  configuration: BackendMutualTlsConfiguration,
): Agent {
  return new Agent({
    ca: readFileSync(configuration.caCertificatePath),
    cert: readFileSync(configuration.clientCertificatePath),
    keepAlive: true,
    key: readFileSync(configuration.clientKeyPath),
    minVersion: "TLSv1.2",
    servername: new URL(backendUrl).hostname,
  });
}
