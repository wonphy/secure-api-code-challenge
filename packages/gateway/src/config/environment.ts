import {
  isLogLevel,
  LOG_LEVELS,
  type LogLevel,
} from "../logging/gateway-logger.js";

export interface JwtConfiguration {
  audience: string;
  issuer: string;
  jwksUrl: URL;
}

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
  const jwt =
    jwksUrl && issuer && audience
      ? { audience, issuer, jwksUrl: new URL(jwksUrl) }
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
    backendUrl: environment.BACKEND_URL ?? "http://localhost:3001",
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
