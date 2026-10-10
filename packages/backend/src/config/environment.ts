import {
  isLogLevel,
  LOG_LEVELS,
  type LogLevel,
} from "../logging/backend-logger.js";

export interface BackendConfiguration {
  logLevel: LogLevel;
  port: number;
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

  return { logLevel, port };
}
