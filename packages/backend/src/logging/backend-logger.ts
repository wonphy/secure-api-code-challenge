export const LOG_LEVELS = ["debug", "info", "warn", "error"] as const;

export type LogLevel = (typeof LOG_LEVELS)[number];

export interface BackendLogger {
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

export function createBackendLogger(minimumLevel: LogLevel): BackendLogger {
  const write = (level: LogLevel, details: Record<string, unknown>): void => {
    if (logPriorities[level] < logPriorities[minimumLevel]) {
      return;
    }

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
    debug: (details: Record<string, unknown>): void => write("debug", details),
    error: (details: Record<string, unknown>): void => write("error", details),
    info: (details: Record<string, unknown>): void => write("info", details),
    warn: (details: Record<string, unknown>): void => write("warn", details),
  };
}
