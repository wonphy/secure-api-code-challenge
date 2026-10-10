import type express from "express";
import type { ClientRequest } from "node:http";
import { createProxyMiddleware } from "http-proxy-middleware";

export function createUsersProxy(backendUrl: string): express.RequestHandler {
  return createProxyMiddleware<express.Request, express.Response>({
    pathFilter: "/api/users",
    target: backendUrl,
    changeOrigin: true,
    on: {
      proxyReq: (
        proxyRequest: ClientRequest,
        _request: express.Request,
        response: express.Response,
      ) => {
        const { verifiedUser } = response.locals;

        // Make this header a gateway assertion: discard caller credentials and spoofed identity.
        proxyRequest.removeHeader("authorization");
        proxyRequest.removeHeader("x-verified-user");

        if (!verifiedUser) {
          proxyRequest.destroy(
            new Error("verified identity is missing at the proxy boundary"),
          );
          return;
        }

        proxyRequest.setHeader("x-verified-user", verifiedUser);
      },
    },
  });
}
