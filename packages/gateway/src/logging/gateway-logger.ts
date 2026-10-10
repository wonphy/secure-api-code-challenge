export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface GatewayLogger {
  debug(details: Record<string, unknown>): void;
  error(details: Record<string, unknown>): void;
  info(details: Record<string, unknown>): void;
  warn(details: Record<string, unknown>): void;
}

const logPriorities: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function isLogLevel(value: string): value is LogLevel {
  return (LOG_LEVELS as readonly string[]).includes(value);
}

export function createGatewayLogger(minimumLevel: LogLevel): GatewayLogger {
  const write = (level: LogLevel, details: Record<string, unknown>): void => {
    if (logPriorities[level] < logPriorities[minimumLevel]) return;

    const entry = JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      ...details,
    });

    if (level === "error") {
      console.error(entry);
    } else if (level === "warn") {
      console.warn(entry);
    } else {
      console.info(entry);
    }
  };

  return {
    debug: (details) => write("debug", details),
    error: (details) => write("error", details),
    info: (details) => write("info", details),
    warn: (details) => write("warn", details),
  };
}
