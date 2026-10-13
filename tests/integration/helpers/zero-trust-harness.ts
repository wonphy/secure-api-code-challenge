import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import https from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { exportJWK, generateKeyPair, SignJWT } from "jose";
import { createApp as createBackendApp } from "../../../packages/backend/src/app.js";
import type { BackendConfiguration } from "../../../packages/backend/src/config/environment.js";
import { createApp as createGatewayApp } from "../../../packages/gateway/src/app.js";
import { createJwtVerifier } from "../../../packages/gateway/src/auth/jwt-verifier.js";
import type { GatewayConfiguration } from "../../../packages/gateway/src/config/environment.js";

const execFileAsync = promisify(execFile);
const issuer = "https://issuer.integration.test/";
const audience = "secure-api";
const keyId = "integration-signing-key";

export type Transport = "http" | "mtls";
export type AuthorizationMode = BackendConfiguration["authorizationMode"];

export interface FlowEndpoints {
  backendUrl: string;
  gatewayUrl: string;
}

interface MutualTlsFiles {
  caCertificatePath: string;
  clientCertificatePath: string;
  clientKeyPath: string;
  serverCertificatePath: string;
  serverKeyPath: string;
}

export class ZeroTrustHarness {
  private readonly certificateDirectories: string[] = [];
  private readonly servers: Array<Server | https.Server> = [];
  private jwksUrl: string | undefined;
  private privateKey!: Awaited<
    ReturnType<typeof generateKeyPair>
  >["privateKey"];

  public jwksRequests = 0;

  async startMockOidc(): Promise<void> {
    const keyPair = await generateKeyPair("RS256");
    this.privateKey = keyPair.privateKey;
    const publicJwk = await exportJWK(keyPair.publicKey);
    publicJwk.alg = "RS256";
    publicJwk.kid = keyId;

    this.jwksUrl = await this.listen(
      createServer((_request, response) => {
        this.jwksRequests += 1;
        response.setHeader("content-type", "application/json");
        response.end(JSON.stringify({ keys: [publicJwk] }));
      }),
    );
  }

  async createAccessToken(
    tokenAudience = audience,
    permissions: string[] = [],
  ): Promise<string> {
    return new SignJWT({ permissions })
      .setProtectedHeader({ alg: "RS256", kid: keyId })
      .setIssuer(issuer)
      .setAudience(tokenAudience)
      .setSubject("integration-user-123")
      .setIssuedAt()
      .setExpirationTime("5m")
      .sign(this.privateKey);
  }

  async startFlow(options: {
    authorizationMode: AuthorizationMode;
    onBackendRequest?: (request: IncomingMessage) => void;
    transport: Transport;
  }): Promise<FlowEndpoints> {
    const mutualTlsFiles =
      options.transport === "mtls"
        ? await this.createMutualTlsFiles()
        : undefined;
    const backendConfiguration: BackendConfiguration = {
      authorizationMode: options.authorizationMode,
      logLevel: "error",
      port: 0,
      ...(mutualTlsFiles
        ? {
            mutualTls: {
              caCertificatePath: mutualTlsFiles.caCertificatePath,
              expectedClientCommonName: "gateway",
              serverCertificatePath: mutualTlsFiles.serverCertificatePath,
              serverKeyPath: mutualTlsFiles.serverKeyPath,
            },
          }
        : {}),
    };
    const backendApp = createBackendApp(backendConfiguration);
    const backendHandler = options.onBackendRequest
      ? (request: IncomingMessage, response: ServerResponse) => {
          options.onBackendRequest?.(request);
          backendApp(request, response);
        }
      : backendApp;
    const backendServer = mutualTlsFiles
      ? https.createServer(
          {
            ca: readFileSync(mutualTlsFiles.caCertificatePath),
            cert: readFileSync(mutualTlsFiles.serverCertificatePath),
            key: readFileSync(mutualTlsFiles.serverKeyPath),
            rejectUnauthorized: true,
            requestCert: true,
          },
          backendHandler,
        )
      : createServer(backendHandler);
    const backendUrl = await this.listen(backendServer);
    const backendUrlWithProtocol = mutualTlsFiles
      ? backendUrl.replace("http:", "https:")
      : backendUrl;

    const verifier = createJwtVerifier({
      algorithms: ["RS256"],
      audience,
      issuer,
      jwksUrl: new URL(`${this.requireJwksUrl()}/.well-known/jwks.json`),
    });
    await verifier.preload();
    const gatewayConfiguration: GatewayConfiguration = {
      backendTimeoutMs: 10_000,
      backendUrl: backendUrlWithProtocol,
      ...(mutualTlsFiles
        ? {
            backendMutualTls: {
              caCertificatePath: mutualTlsFiles.caCertificatePath,
              clientCertificatePath: mutualTlsFiles.clientCertificatePath,
              clientKeyPath: mutualTlsFiles.clientKeyPath,
            },
          }
        : {}),
      isDevelopment: false,
      logLevel: "error",
      port: 0,
    };

    return {
      backendUrl: backendUrlWithProtocol,
      gatewayUrl: await this.listen(
        createServer(createGatewayApp(gatewayConfiguration, verifier)),
      ),
    };
  }

  async requestWithoutClientCertificate(url: string): Promise<void> {
    const directory = this.certificateDirectories.at(-1);
    if (!directory) {
      throw new Error("mTLS certificates have not been created.");
    }
    await new Promise<void>((resolve, reject) => {
      const request = https.get(
        url,
        { ca: readFileSync(join(directory, "ca.crt")) },
        (response) => {
          response.resume();
          resolve();
        },
      );
      request.once("error", reject);
    });
  }

  async close(): Promise<void> {
    await Promise.all(
      this.servers
        .splice(0)
        .map(
          (server) =>
            new Promise<void>((resolve, reject) =>
              server.close((error) => (error ? reject(error) : resolve())),
            ),
        ),
    );
    await Promise.all(
      this.certificateDirectories.map((directory) =>
        rm(directory, { force: true, recursive: true }),
      ),
    );
  }

  private async listen(server: Server | https.Server): Promise<string> {
    this.servers.push(server);
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    return `http://127.0.0.1:${address.port}`;
  }

  private async createMutualTlsFiles(): Promise<MutualTlsFiles> {
    // Test-only certificates keep the mTLS flow self-contained.
    const directory = await mkdtemp(
      join(tmpdir(), "secure-api-integration-mtls-"),
    );
    this.certificateDirectories.push(directory);
    const path = (fileName: string): string => join(directory, fileName);

    await execFileAsync("openssl", ["genrsa", "-out", path("ca.key"), "2048"]);
    await execFileAsync("openssl", [
      "req",
      "-x509",
      "-new",
      "-sha256",
      "-days",
      "1",
      "-key",
      path("ca.key"),
      "-out",
      path("ca.crt"),
      "-subj",
      "/CN=secure-api-integration-ca",
    ]);
    await this.createSignedCertificate(
      path,
      "backend",
      "serverAuth",
      "IP:127.0.0.1",
    );
    await this.createSignedCertificate(
      path,
      "gateway",
      "clientAuth",
      "DNS:gateway",
    );

    return {
      caCertificatePath: path("ca.crt"),
      clientCertificatePath: path("gateway.crt"),
      clientKeyPath: path("gateway.key"),
      serverCertificatePath: path("backend.crt"),
      serverKeyPath: path("backend.key"),
    };
  }

  private async createSignedCertificate(
    path: (fileName: string) => string,
    commonName: string,
    usage: "clientAuth" | "serverAuth",
    subjectAlternativeName: string,
  ): Promise<void> {
    await execFileAsync("openssl", [
      "genrsa",
      "-out",
      path(`${commonName}.key`),
      "2048",
    ]);
    await execFileAsync("openssl", [
      "req",
      "-new",
      "-key",
      path(`${commonName}.key`),
      "-out",
      path(`${commonName}.csr`),
      "-subj",
      `/CN=${commonName}`,
    ]);
    const extensionsPath = path(`${commonName}.ext`);
    await writeFile(
      extensionsPath,
      `subjectAltName=${subjectAlternativeName}\nextendedKeyUsage=${usage}\nkeyUsage=digitalSignature,keyEncipherment\n`,
    );
    await execFileAsync("openssl", [
      "x509",
      "-req",
      "-sha256",
      "-days",
      "1",
      "-in",
      path(`${commonName}.csr`),
      "-CA",
      path("ca.crt"),
      "-CAkey",
      path("ca.key"),
      "-CAcreateserial",
      "-out",
      path(`${commonName}.crt`),
      "-extfile",
      extensionsPath,
    ]);
  }

  private requireJwksUrl(): string {
    if (!this.jwksUrl) {
      throw new Error("Mock OIDC provider has not been started.");
    }
    return this.jwksUrl;
  }
}
