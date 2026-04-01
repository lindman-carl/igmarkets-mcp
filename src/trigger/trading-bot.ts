/**
 * Trading Bot — Trigger.dev Scheduled Task
 *
 * This is the Trigger.dev entry point for the automated trading bot.
 * It runs on a configurable cron schedule and executes one tick per invocation.
 *
 * Configuration is loaded from environment variables:
 *   IG_API_KEY, IG_USERNAME, IG_PASSWORD, IG_DEMO
 *   BOT_STRATEGY, BOT_INTERVAL, BOT_DB_PATH
 *
 * Or from a bot-config.json file in the project root.
 *
 * Setup:
 *   1. Install: npm install @trigger.dev/sdk
 *   2. Configure trigger.config.ts (set project ref)
 *   3. Set environment variables in Trigger.dev dashboard
 *   4. Deploy: npx trigger.dev deploy
 *
 * The cron expression defaults to every 15 minutes during market hours
 * (Mon–Fri 08:00–16:00 London time). Override via BOT_INTERVAL env var.
 */

import { schedules, logger as triggerLogger } from "@trigger.dev/sdk/v3";
import { executeTick } from "../bot/tick.js";
import { loadBotConfig, buildCronExpression } from "../bot/config.js";
import { createLogger, LOG_CATEGORIES } from "../bot/logger.js";

// ---------------------------------------------------------------------------
// Scheduled Task Definition
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
// Manual Trigger Task (for testing / one-off runs)
// ---------------------------------------------------------------------------

import { task } from "@trigger.dev/sdk/v3";

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
