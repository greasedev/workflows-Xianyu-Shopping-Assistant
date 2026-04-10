export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (msg: string, meta?: Record<string, unknown>) => void;
  info: (msg: string, meta?: Record<string, unknown>) => void;
  warn: (msg: string, meta?: Record<string, unknown>) => void;
  error: (msg: string, meta?: Record<string, unknown>) => void;
};

const levelRank: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(opts?: { level?: LogLevel }): Logger {
  const minLevel: LogLevel = opts?.level ?? "info";

  const log = (level: LogLevel, msg: string, meta?: Record<string, unknown>) => {
    if (levelRank[level] < levelRank[minLevel]) return;
    const entry = {
      ts: new Date().toLocaleString("zh-CN", { hour12: false}),
      level,
      msg,
      ...(meta ? { meta } : {}),
    };

    // Use console in all environments for compatibility
    const consoleMethod = level === "error" ? "error" : level === "warn" ? "warn" : "log";
    console[consoleMethod](JSON.stringify(entry));
  };

  return {
    debug: (msg, meta) => log("debug", msg, meta),
    info: (msg, meta) => log("info", msg, meta),
    warn: (msg, meta) => log("warn", msg, meta),
    error: (msg, meta) => log("error", msg, meta),
  };
}
