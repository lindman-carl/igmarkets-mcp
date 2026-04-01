/**
 * Backtest Task — Trigger.dev Manual Task
 *
 * Runs a backtest simulation for a given strategy and date range.
 * Results are persisted to the database and returned as the task output.
 *
 * This is a manual (on-demand) task — it is NOT scheduled. Trigger it via:
 *   - The Trigger.dev dashboard → "Test" tab
 *   - The MCP trigger_trigger_task tool
 *   - SDK: tasks.trigger("backtest", payload)
 *
 * Payload schema: BacktestTaskPayload
 *
 * Example payload:
 * {
 *   "strategyName": "trend-following",
 *   "instruments": [
 *     { "epic": "IX.D.FTSE.DAILY.IP", "expiry": "DFB", "currencyCode": "GBP" }
 *   ],
 *   "startingCapital": 10000,
 *   "dateRange": { "from": "2024-01-01", "to": "2024-12-31" },
 *   "resolution": "DAY"
 * }
 */

import { task, logger as triggerLogger } from "@trigger.dev/sdk/v3";
import { runBacktest } from "../bot/backtest/backtest.js";
import { createDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import type { BacktestConfig } from "../bot/backtest/schemas.js";

// ---------------------------------------------------------------------------
// Payload type (plain JSON from Trigger.dev dashboard)
// ---------------------------------------------------------------------------

/** Serialisable payload accepted by the backtest task. */
export interface BacktestTaskPayload {
  /** Which strategy to backtest */
  strategyName: BacktestConfig["strategyName"];
  /** Instruments to include */
  instruments: BacktestConfig["instruments"];
  /** Starting cash balance (default: 10 000) */
  startingCapital?: number;
  /**
   * Date range for historical data.
   * ISO date strings are accepted ("2024-01-01") — converted to Date internally.
   */
  dateRange: {
    from: string;
    to: string;
  };
  /** Price resolution (default: "DAY") */
  resolution?: string;
  /** Optional strategy parameter overrides */
  strategyParams?: BacktestConfig["strategyParams"];
  /** Optional risk config overrides */
  riskConfig?: BacktestConfig["riskConfig"];
  /** Simulated spread in price points (default: 1) */
  spreadPips?: number;
  /** Simulated slippage in price points (default: 0.5) */
  slippagePips?: number;
  /**
   * Optional static sentiment data for sentiment-contrarian strategy.
   * Key = epic, value = { longPositionPercentage, shortPositionPercentage }
   */
  sentiment?: BacktestConfig["sentiment"];
}

// ---------------------------------------------------------------------------
// Task definition
// ---------------------------------------------------------------------------

export const backtestTask = task({
  id: "backtest",
  // No retries — backtests are long-running and idempotent via runId
  retry: {
    maxAttempts: 1,
  },

  run: async (payload: BacktestTaskPayload) => {
    triggerLogger.info("Backtest task starting", {
      strategyName: payload.strategyName,
      instruments: payload.instruments.map((i) => i.epic),
      dateRange: payload.dateRange,
      resolution: payload.resolution ?? "DAY",
    });

    // -------------------------------------------------------------------------
    // Set up database connection
    // -------------------------------------------------------------------------
    const db = createDatabase();

    try {
      await runMigrations();
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      triggerLogger.warn("DB migration warning (may be safe to ignore)", {
        error: msg,
      });
    }

    // -------------------------------------------------------------------------
    // Build BacktestConfig from payload
    // -------------------------------------------------------------------------
    const config: BacktestConfig = {
      strategyName: payload.strategyName,
      instruments: payload.instruments,
      startingCapital: payload.startingCapital ?? 10_000,
      dateRange: {
        from: new Date(payload.dateRange.from),
        to: new Date(payload.dateRange.to),
      },
      resolution: payload.resolution ?? "DAY",
      strategyParams: payload.strategyParams,
      riskConfig: payload.riskConfig,
      spreadPips: payload.spreadPips ?? 1,
      slippagePips: payload.slippagePips ?? 0.5,
      sentiment: payload.sentiment,
    };

    triggerLogger.info("Running backtest simulation", {
      startingCapital: config.startingCapital,
      spreadPips: config.spreadPips,
      slippagePips: config.slippagePips,
    });

    // -------------------------------------------------------------------------
    // Run the backtest
    // -------------------------------------------------------------------------
    const result = await runBacktest(config, undefined, db);

    // -------------------------------------------------------------------------
    // Log summary
    // -------------------------------------------------------------------------
    triggerLogger.info("Backtest completed", {
      runId: result.runId,
      durationMs: result.durationMs,
      totalTrades: result.metrics.totalTrades,
      winRate: `${(result.metrics.winRate * 100).toFixed(1)}%`,
      totalReturnPct: `${(result.metrics.totalReturnPct * 100).toFixed(2)}%`,
      sharpeRatio: result.metrics.sharpeRatio.toFixed(3),
      maxDrawdownPct: `${(result.metrics.maxDrawdownPct * 100).toFixed(2)}%`,
      warnings: result.warnings,
    });

    if (result.warnings.length > 0) {
      triggerLogger.warn("Backtest warnings", { warnings: result.warnings });
    }

    // -------------------------------------------------------------------------
    // Return summary (Trigger.dev persists this as the run output)
    // -------------------------------------------------------------------------
    return {
      runId: result.runId,
      strategyName: config.strategyName,
      dateRange: payload.dateRange,
      durationMs: result.durationMs,
      metrics: {
        totalTrades: result.metrics.totalTrades,
        winRate: result.metrics.winRate,
        profitFactor: result.metrics.profitFactor,
        totalReturn: result.metrics.totalReturn,
        totalReturnPct: result.metrics.totalReturnPct,
        annualizedReturnPct: result.metrics.annualizedReturnPct,
        sharpeRatio: result.metrics.sharpeRatio,
        sortinoRatio: result.metrics.sortinoRatio,
        maxDrawdownPct: result.metrics.maxDrawdownPct,
        maxDrawdownAmount: result.metrics.maxDrawdownAmount,
        maxDrawdownDurationBars: result.metrics.maxDrawdownDurationBars,
        avgWin: result.metrics.avgWin,
        avgLoss: result.metrics.avgLoss,
        finalEquity: result.metrics.finalEquity,
        peakEquity: result.metrics.peakEquity,
        totalBarsProcessed: result.metrics.totalBarsProcessed,
      },
      warnings: result.warnings,
    };
  },
});
