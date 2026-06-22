type LogLevel = "debug" | "info" | "warn" | "error";

type LogContext = Record<string, unknown>;

function shouldLogDebug(): boolean {
  return process.env.LOG_LEVEL === "debug" || process.env.NODE_ENV !== "production";
}

function safeSerialize(value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  return value;
}

function writeLog(level: LogLevel, message: string, context: LogContext = {}) {
  if (level === "debug" && !shouldLogDebug()) {
    return;
  }

  const payload = {
    timestamp: new Date().toISOString(),
    level,
    message,
    service: "reachiq-web",
    env: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? "unknown",
    ...Object.fromEntries(Object.entries(context).map(([key, value]) => [key, safeSerialize(value)])),
  };

  const serialized = JSON.stringify(payload);
  if (level === "error") {
    console.error(serialized);
    return;
  }
  if (level === "warn") {
    console.warn(serialized);
    return;
  }
  console.log(serialized);
}

export const logger = {
  debug(message: string, context?: LogContext) {
    writeLog("debug", message, context);
  },
  info(message: string, context?: LogContext) {
    writeLog("info", message, context);
  },
  warn(message: string, context?: LogContext) {
    writeLog("warn", message, context);
  },
  error(message: string, context?: LogContext) {
    writeLog("error", message, context);
  },
};
