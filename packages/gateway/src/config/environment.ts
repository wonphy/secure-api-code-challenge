import type { JWSAlgorithm } from "jose";
import {
  isLogLevel,
  LOG_LEVELS,
  type LogLevel,
} from "../logging/gateway-logger.js";

export interface JwtConfiguration {
  algorithms: JWSAlgorithm[];
  audience: string;
  issuer: string;
  jwksUrl: URL;
}

const SUPPORTED_JWT_ALGORITHMS = [
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
] as const satisfies readonly JWSAlgorithm[];

export interface GatewayConfiguration {
  backendUrl: string;
  developmentToken?: string;
  developmentUser?: string;
  isDevelopment: boolean;
  jwt?: JwtConfiguration;
  logLevel: LogLevel;
  port: number;
}

export function loadConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): GatewayConfiguration {
  const port = Number.parseInt(environment.PORT ?? "3000", 10);
  if (Number.isNaN(port) || port <= 0) {
    throw new Error("PORT must be a positive integer.");
  }

  const isDevelopment = environment.NODE_ENV === "development";
  const jwksUrl = environment.JWT_JWKS_URL;
  const issuer = environment.JWT_ISSUER;
  const audience = environment.JWT_AUDIENCE;
  const jwtSettingsProvided = Boolean(jwksUrl || issuer || audience);
  const logLevel = environment.LOG_LEVEL ?? "info";
  const backendUrl = parseHttpUrl(
    environment.BACKEND_URL ?? "http://localhost:3001",
    "BACKEND_URL",
  );
  const allowedBackendHosts = parseCommaSeparatedValues(
    environment.BACKEND_ALLOWED_HOSTS,
  ).map((host) => host.toLowerCase());
  if (!isDevelopment) {
    if (allowedBackendHosts.length === 0) {
      throw new Error(
        "BACKEND_ALLOWED_HOSTS must name the approved backend hostname outside development mode.",
      );
    }
    if (!allowedBackendHosts.includes(backendUrl.hostname.toLowerCase())) {
      throw new Error("BACKEND_URL hostname is not in BACKEND_ALLOWED_HOSTS.");
    }
  }

  const jwt =
    jwksUrl && issuer && audience
      ? createJwtConfiguration(
          jwksUrl,
          issuer,
          audience,
          isDevelopment,
          environment,
        )
      : undefined;

  // A partial JWT configuration must not silently fall back to another mode.
  if (jwtSettingsProvided && !jwt) {
    throw new Error(
      "JWT authentication requires JWT_JWKS_URL, JWT_ISSUER, and JWT_AUDIENCE.",
    );
  }

  // The development token bypass is intentionally unavailable in deployed environments.
  if (!jwt && !isDevelopment) {
    throw new Error(
      "JWT authentication must be configured outside development mode.",
    );
  }

  if (!isLogLevel(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(", ")}.`);
  }

  return {
    backendUrl: backendUrl.toString(),
    developmentToken: isDevelopment ? environment.DEV_GATEWAY_TOKEN : undefined,
    developmentUser: isDevelopment
      ? (environment.DEV_GATEWAY_USER ?? "local-dev-user")
      : undefined,
    isDevelopment,
    jwt,
    logLevel,
    port,
  };
}

function createJwtConfiguration(
  jwksUrl: string,
  issuer: string,
  audience: string,
  isDevelopment: boolean,
  environment: NodeJS.ProcessEnv,
): JwtConfiguration {
  const parsedJwksUrl = parseHttpUrl(jwksUrl, "JWT_JWKS_URL");
  if (!isDevelopment && parsedJwksUrl.protocol !== "https:") {
    throw new Error("JWT_JWKS_URL must use HTTPS outside development mode.");
  }

  return {
    algorithms: parseJwtAlgorithms(environment.JWT_ALLOWED_ALGORITHMS),
    audience,
    issuer,
    jwksUrl: parsedJwksUrl,
  };
}

function parseHttpUrl(value: string, name: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use HTTP or HTTPS.`);
  }
  if (!url.hostname) {
    throw new Error(`${name} must include a hostname.`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} must not contain credentials.`);
  }

  return url;
}

function parseCommaSeparatedValues(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseJwtAlgorithms(value: string | undefined): JWSAlgorithm[] {
  const algorithms = parseCommaSeparatedValues(value ?? "RS256");
  if (
    algorithms.length === 0 ||
    !algorithms.every((algorithm) =>
      (SUPPORTED_JWT_ALGORITHMS as readonly string[]).includes(algorithm),
    )
  ) {
    throw new Error(
      `JWT_ALLOWED_ALGORITHMS must contain only: ${SUPPORTED_JWT_ALGORITHMS.join(", ")}.`,
    );
  }

  return algorithms as JWSAlgorithm[];
}
