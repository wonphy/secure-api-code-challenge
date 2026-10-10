import {
  isLogLevel,
  LOG_LEVELS,
  type LogLevel,
} from "../logging/backend-logger.js";

export interface BackendConfiguration {
  authorizationMode: AuthorizationMode;
  logLevel: LogLevel;
  port: number;
  mutualTls?: MutualTlsConfiguration;
}

export interface MutualTlsConfiguration {
  caCertificatePath: string;
  expectedClientCommonName: string;
  serverCertificatePath: string;
  serverKeyPath: string;
}

export const AUTHORIZATION_MODES = ["identity-only", "permissions"] as const;
export type AuthorizationMode = (typeof AUTHORIZATION_MODES)[number];

function isAuthorizationMode(value: string): value is AuthorizationMode {
  return (AUTHORIZATION_MODES as readonly string[]).includes(value);
}

export function loadConfiguration(
  environment: NodeJS.ProcessEnv = process.env,
): BackendConfiguration {
  const port = Number.parseInt(environment.PORT ?? "3001", 10);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("PORT must be an integer between 0 and 65535");
  }
  const logLevel = environment.LOG_LEVEL ?? "info";
  if (!isLogLevel(logLevel)) {
    throw new Error(`LOG_LEVEL must be one of: ${LOG_LEVELS.join(", ")}.`);
  }

  const authorizationMode = environment.AUTHORIZATION_MODE ?? "identity-only";
  if (!isAuthorizationMode(authorizationMode)) {
    throw new Error(
      `AUTHORIZATION_MODE must be one of: ${AUTHORIZATION_MODES.join(", ")}.`,
    );
  }

  const mutualTls = loadMutualTlsConfiguration(environment);

  return { authorizationMode, logLevel, mutualTls, port };
}

function loadMutualTlsConfiguration(
  environment: NodeJS.ProcessEnv,
): MutualTlsConfiguration | undefined {
  const mode = environment.BACKEND_TLS_MODE ?? "http";
  if (mode === "http") {
    return undefined;
  }
  if (mode !== "mtls") {
    throw new Error("BACKEND_TLS_MODE must be either http or mtls.");
  }

  return {
    caCertificatePath: requiredEnvironmentValue(
      environment.TLS_CA_CERT_PATH,
      "TLS_CA_CERT_PATH",
    ),
    expectedClientCommonName: environment.TLS_EXPECTED_CLIENT_CN ?? "gateway",
    serverCertificatePath: requiredEnvironmentValue(
      environment.TLS_SERVER_CERT_PATH,
      "TLS_SERVER_CERT_PATH",
    ),
    serverKeyPath: requiredEnvironmentValue(
      environment.TLS_SERVER_KEY_PATH,
      "TLS_SERVER_KEY_PATH",
    ),
  };
}

function requiredEnvironmentValue(
  value: string | undefined,
  name: string,
): string {
  if (!value) {
    throw new Error(`${name} is required when BACKEND_TLS_MODE=mtls.`);
  }

  return value;
}
