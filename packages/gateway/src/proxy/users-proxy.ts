import type express from "express";
import {
  type ClientRequest,
  type IncomingMessage,
  ServerResponse,
} from "node:http";
import type { Socket } from "node:net";
import { createProxyMiddleware } from "http-proxy-middleware";
import type { GatewayLogger } from "../logging/gateway-logger.js";

export function createUsersProxy(
  backendUrl: string,
  logger: GatewayLogger,
): express.RequestHandler {
  return createProxyMiddleware<express.Request, express.Response>({
    pathFilter: "/api/users",
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
        proxyRequest.removeHeader("x-verified-user");
        proxyRequest.removeHeader("x-verified-user-permissions");

        if (!verifiedUser) {
          proxyRequest.destroy(
            new Error("verified identity is missing at the proxy boundary"),
          );
          return;
        }

        proxyRequest.setHeader("x-verified-user", verifiedUser);
        proxyRequest.setHeader(
          "x-verified-user-permissions",
          JSON.stringify(verifiedUserPermissions),
        );
      },
    },
  });
}
