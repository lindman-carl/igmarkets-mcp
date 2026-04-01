/**
 * Structured Trade Journal Logger
 *
 * Provides structured logging for the trading bot. Logs are:
 * 1. Written to stdout as JSON lines (for Trigger.dev/container logging)
 * 2. Optionally recorded in the database via the tick/trade tables
 *
 * Log levels: debug, info, warn, error
 * All log entries include a timestamp and category.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  category: string;
  message: string;
  data?: Record<string, unknown>;
}

export interface Logger {
  debug: (
    category: string,
    message: string,
    data?: Record<string, unknown>,
  ) => void;
  info: (
    category: string,
    message: string,
    data?: Record<string, unknown>,
  ) => void;
  warn: (
    category: string,
    message: string,
    data?: Record<string, unknown>,
  ) => void;
  error: (
    category: string,
    message: string,
    data?: Record<string, unknown>,
  ) => void;
  /** Get all logged entries (for testing/review). */
  getEntries: () => LogEntry[];
}

// ---------------------------------------------------------------------------
// Logger Factory
// ---------------------------------------------------------------------------

/**
 * Create a structured logger instance.
 *
 * @param minLevel - Minimum log level to output (default: "info")
 * @param silent - If true, suppresses console output (useful for testing)
 * @returns Logger instance
 */
export function createLogger(
  minLevel: LogLevel = "info",
  silent = false,
): Logger {
  const entries: LogEntry[] = [];
  const levels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  function log(
    level: LogLevel,
    category: string,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      category,
      message,
      data,
    };

    entries.push(entry);

    if (!silent && levels[level] >= levels[minLevel]) {
      const prefix = `[${entry.timestamp}] [${level.toUpperCase()}] [${category}]`;
      const line = data
        ? `${prefix} ${message} ${JSON.stringify(data)}`
        : `${prefix} ${message}`;

      switch (level) {
        case "error":
          console.error(line);
          break;
        case "warn":
          console.warn(line);
          break;
        default:
          console.log(line);
          break;
      }
    }
  }

  return {
    debug: (category, message, data) => log("debug", category, message, data),
    info: (category, message, data) => log("info", category, message, data),
    warn: (category, message, data) => log("warn", category, message, data),
    error: (category, message, data) => log("error", category, message, data),
    getEntries: () => [...entries],
  };
}

// ---------------------------------------------------------------------------
// Convenience: Log categories
// ---------------------------------------------------------------------------

/** Standard log categories used throughout the bot. */
export const LOG_CATEGORIES = {
  TICK: "tick",
  SESSION: "session",
  STRATEGY: "strategy",
  SIGNAL: "signal",
  SIZING: "sizing",
  EXECUTION: "execution",
  POSITION: "position",
  CIRCUIT_BREAKER: "circuit-breaker",
  MARKET: "market",
  ERROR: "error",
} as const;
