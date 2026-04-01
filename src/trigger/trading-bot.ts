/**
 * Trading Bot — Trigger.dev Scheduled Tasks
 *
 * This is the Trigger.dev entry point for the automated trading bot.
 * It provides three tasks:
 *
 *   1. `trading-bot` — Original single-account scheduled task
 *      Runs on a configurable cron schedule using env vars / config file.
 *
 *   2. `trading-bot-multi` — Multi-account scheduled task
 *      Iterates all active accounts in the database, loading each account's
 *      linked strategy, and executes a tick for each one.
 *
 *   3. `trading-bot-manual` — Manual one-off task (for testing)
 *
 * Configuration is loaded from environment variables:
 *   IG_API_KEY, IG_USERNAME, IG_PASSWORD, IG_DEMO
 *   BOT_STRATEGY, BOT_INTERVAL, BOT_DB_PATH
 *
 * Or from a bot-config.json file in the project root.
 *
 * Setup:
 *   1. Install: pnpm add @trigger.dev/sdk
 *   2. Configure trigger.config.ts (set project ref)
 *   3. Set environment variables in Trigger.dev dashboard
 *   4. Deploy: npx trigger.dev deploy
 *
 * The cron expression defaults to every 15 minutes during market hours
 * (Mon–Fri 08:00–16:00 London time). Override via BOT_INTERVAL env var.
 */

import { schedules, logger as triggerLogger, task } from "@trigger.dev/sdk/v3";
import { executeTick, executeAllAccountTicks } from "../bot/tick.js";
import { loadBotConfig, buildCronExpression } from "../bot/config.js";
import { createLogger, LOG_CATEGORIES } from "../bot/logger.js";
import { createDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";

// ---------------------------------------------------------------------------
// Scheduled Task: Single-Account (original)
// ---------------------------------------------------------------------------

export const tradingBot = schedules.task({
  id: "trading-bot",
  // Default: every 15 minutes during market hours, Mon-Fri
  // This can be overridden by creating an imperative schedule via the SDK
  cron: {
    pattern: "*/15 8-16 * * 1-5",
    timezone: "Europe/London",
  },
  // No retries for trading tasks — retrying could cause duplicate trades
  retry: {
    maxAttempts: 1,
  },
  run: async (payload) => {
    const startTime = Date.now();

    triggerLogger.info("Trading bot tick starting", {
      timestamp: payload.timestamp.toISOString(),
      lastTimestamp: payload.lastTimestamp?.toISOString() ?? "first run",
      timezone: payload.timezone,
    });

    // Load config (from env vars + optional config file)
    let config: ReturnType<typeof loadBotConfig>;
    try {
      config = loadBotConfig();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      triggerLogger.error("Failed to load bot config", { error: msg });
      return { status: "error", error: `Config error: ${msg}` };
    }

    // Create logger that outputs to both stdout (Trigger.dev captures)
    // and collects entries for review
    const logger = createLogger("info");

    // Execute the tick
    const result = await executeTick({ config, logger });

    // Log summary to Trigger.dev
    triggerLogger.info("Trading bot tick completed", {
      tickId: result.tickId,
      status: result.status,
      instrumentsScanned: result.instrumentsScanned,
      signalsGenerated: result.signalsGenerated,
      tradesExecuted: result.tradesExecuted,
      durationMs: result.durationMs,
      error: result.error,
    });

    return {
      tickId: result.tickId,
      status: result.status,
      instrumentsScanned: result.instrumentsScanned,
      signalsGenerated: result.signalsGenerated,
      tradesExecuted: result.tradesExecuted,
      durationMs: result.durationMs,
      error: result.error,
    };
  },
});

// ---------------------------------------------------------------------------
// Scheduled Task: Multi-Account
// ---------------------------------------------------------------------------

export const tradingBotMulti = schedules.task({
  id: "trading-bot-multi",
  cron: {
    pattern: "*/15 8-16 * * 1-5",
    timezone: "Europe/London",
  },
  retry: {
    maxAttempts: 1,
  },
  run: async (payload) => {
    triggerLogger.info("Multi-account trading bot tick starting", {
      timestamp: payload.timestamp.toISOString(),
      lastTimestamp: payload.lastTimestamp?.toISOString() ?? "first run",
      timezone: payload.timezone,
    });

    const dbPath = process.env.BOT_DB_PATH ?? "bot.db";
    runMigrations(dbPath);
    const db = createDatabase(dbPath);
    const logger = createLogger("info");

    const result = await executeAllAccountTicks({ db, logger });

    triggerLogger.info("Multi-account trading bot tick completed", {
      totalAccounts: result.totalAccounts,
      durationMs: result.durationMs,
      completed: result.results.filter(
        (r) => r.tickResult.status === "completed",
      ).length,
      skipped: result.results.filter((r) => r.tickResult.status === "skipped")
        .length,
      errors: result.results.filter((r) => r.tickResult.status === "error")
        .length,
    });

    return {
      totalAccounts: result.totalAccounts,
      durationMs: result.durationMs,
      accounts: result.results.map((r) => ({
        accountId: r.accountId,
        accountName: r.accountName,
        strategyName: r.strategyName,
        status: r.tickResult.status,
        tickId: r.tickResult.tickId,
        trades: r.tickResult.tradesExecuted,
        signals: r.tickResult.signalsGenerated,
        error: r.tickResult.error,
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// Manual Trigger Task (for testing / one-off runs)
// ---------------------------------------------------------------------------

export const tradingBotManual = task({
  id: "trading-bot-manual",
  retry: {
    maxAttempts: 1,
  },
  run: async (payload: { configOverrides?: Record<string, unknown> }) => {
    triggerLogger.info("Manual trading bot tick starting");

    let config: ReturnType<typeof loadBotConfig>;
    try {
      config = loadBotConfig(payload.configOverrides);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      triggerLogger.error("Failed to load bot config", { error: msg });
      return { status: "error", error: `Config error: ${msg}` };
    }

    const logger = createLogger("debug");
    const result = await executeTick({ config, logger });

    triggerLogger.info("Manual trading bot tick completed", {
      tickId: result.tickId,
      status: result.status,
      tradesExecuted: result.tradesExecuted,
      durationMs: result.durationMs,
    });

    return result;
  },
});
