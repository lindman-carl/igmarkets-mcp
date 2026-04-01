/**
 * Bot Configuration Loader
 *
 * Loads bot configuration from multiple sources with priority:
 *   1. Explicit config object (passed directly)
 *   2. Environment variables (IG_API_KEY, IG_USERNAME, etc.)
 *   3. JSON config file (bot-config.json)
 *
 * All sources are merged and validated through the BotConfigSchema.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { parseBotConfig } from "./schemas.js";
import type { BotConfig } from "./schemas.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Partial config that can come from environment variables. */
interface EnvConfig {
  apiKey?: string;
  username?: string;
  password?: string;
  isDemo?: boolean;
  strategy?: string;
  intervalMinutes?: number;
  dbPath?: string;
}

// ---------------------------------------------------------------------------
// Environment Variable Loader
// ---------------------------------------------------------------------------

/**
 * Extract bot config values from environment variables.
 *
 * Supported variables:
 *   IG_API_KEY      — IG Markets API key
 *   IG_USERNAME     — IG account username/identifier
 *   IG_PASSWORD     — IG account password
 *   IG_DEMO         — "true" | "false" (default: true)
 *   BOT_STRATEGY    — Strategy name
 *   BOT_INTERVAL    — Tick interval in minutes (5, 10, 15, 60)
 *   BOT_DB_PATH     — Path to SQLite database file
 */
function loadFromEnv(): EnvConfig {
  const env: EnvConfig = {};

  if (process.env.IG_API_KEY) env.apiKey = process.env.IG_API_KEY;
  if (process.env.IG_USERNAME) env.username = process.env.IG_USERNAME;
  if (process.env.IG_PASSWORD) env.password = process.env.IG_PASSWORD;
  if (process.env.IG_DEMO !== undefined) {
    env.isDemo = process.env.IG_DEMO !== "false";
  }
  if (process.env.BOT_STRATEGY) env.strategy = process.env.BOT_STRATEGY;
  if (process.env.BOT_INTERVAL) {
    const parsed = parseInt(process.env.BOT_INTERVAL, 10);
    if ([5, 10, 15, 60].includes(parsed)) {
      env.intervalMinutes = parsed;
    }
  }
  if (process.env.BOT_DB_PATH) env.dbPath = process.env.BOT_DB_PATH;

  return env;
}

// ---------------------------------------------------------------------------
// File Loader
// ---------------------------------------------------------------------------

/**
 * Load config from a JSON file.
 *
 * @param configPath - Path to the JSON config file (default: "bot-config.json")
 * @returns Parsed JSON object, or null if file not found
 */
function loadFromFile(configPath?: string): Record<string, unknown> | null {
  const filePath = resolve(configPath ?? "bot-config.json");

  if (!existsSync(filePath)) return null;

  try {
    const content = readFileSync(filePath, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main Config Loader
// ---------------------------------------------------------------------------

/**
 * Load and validate bot configuration from all available sources.
 *
 * Priority (higher overrides lower):
 *   1. `overrides` parameter (explicit values)
 *   2. Environment variables
 *   3. Config file (bot-config.json)
 *
 * @param overrides - Explicit config overrides
 * @param configFilePath - Path to the JSON config file
 * @returns Fully resolved and validated BotConfig
 * @throws If required fields are missing or validation fails
 */
export function loadBotConfig(
  overrides?: Partial<Record<string, unknown>>,
  configFilePath?: string,
): BotConfig &
  Required<Pick<BotConfig, "strategyParams" | "risk" | "circuitBreaker">> {
  // Layer 1: File config
  const fileConfig = loadFromFile(configFilePath) ?? {};

  // Layer 2: Environment variables
  const envConfig = loadFromEnv();

  // Merge: file → env → overrides
  const merged = {
    ...fileConfig,
    ...stripUndefined(envConfig as Record<string, unknown>),
    ...stripUndefined((overrides ?? {}) as Record<string, unknown>),
  };

  return parseBotConfig(merged);
}

// ---------------------------------------------------------------------------
// Helper: Build Cron Expression
// ---------------------------------------------------------------------------

/**
 * Build a cron expression for the given interval, optionally scoped to
 * market hours (Monday–Friday, 8:00–16:30 London time).
 *
 * @param intervalMinutes - Tick interval (5, 10, 15, or 60)
 * @param marketHoursOnly - Restrict to market hours (default: true)
 * @returns Cron expression string
 */
export function buildCronExpression(
  intervalMinutes: 5 | 10 | 15 | 60,
  marketHoursOnly = true,
): string {
  if (!marketHoursOnly) {
    if (intervalMinutes === 60) return "0 * * * *";
    return `*/${intervalMinutes} * * * *`;
  }

  // Market hours: Mon–Fri, 08:00–16:30 London time
  // (We use 8–16 hour range; the 16:30 close is covered by the 16:xx run)
  if (intervalMinutes === 60) {
    return "0 8-16 * * 1-5";
  }

  return `*/${intervalMinutes} 8-16 * * 1-5`;
}

// ---------------------------------------------------------------------------
// Helper: Strip undefined values from an object
// ---------------------------------------------------------------------------

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (value !== undefined) {
      result[key] = value;
    }
  }
  return result;
}
