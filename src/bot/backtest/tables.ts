/**
 * Backtest Tables — Drizzle ORM schema for backtest persistence.
 *
 * Three new PostgreSQL tables:
 *   backtestRuns   — one row per backtest execution
 *   backtestTrades — simulated trades per run
 *   backtestEquity — bar-by-bar equity curve per run
 *
 * All tables are additive (no ALTER on existing tables).
 * They live in src/bot/ alongside the rest of the backtest module and
 * are re-exported from src/db/schema.ts.
 */

import { pgTable, index } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Backtest Runs — one row per backtest execution
// ---------------------------------------------------------------------------

export const backtestRuns = pgTable(
  "backtest_runs",
  {
    id: t.serial().primaryKey(),
    /** Strategy used */
    strategyName: t.text("strategy_name").notNull(),
    /** JSON array of WatchlistItem objects */
    instruments: t.jsonb().notNull(),
    /** Starting capital for the simulation */
    startingCapital: t.doublePrecision("starting_capital").notNull(),
    /** Candle range start */
    dateFrom: t.timestamp("date_from", { withTimezone: true }).notNull(),
    /** Candle range end */
    dateTo: t.timestamp("date_to", { withTimezone: true }).notNull(),
    /** Price resolution (e.g. "DAY", "HOUR") */
    resolution: t.text().notNull().default("DAY"),
    /** JSON blob with strategy parameter overrides */
    strategyParams: t.jsonb("strategy_params"),
    /** JSON blob with risk config overrides */
    riskConfig: t.jsonb("risk_config"),
    /** Simulated spread in price points */
    spreadPips: t.doublePrecision("spread_pips").notNull().default(1),
    /** Simulated slippage in price points */
    slippagePips: t.doublePrecision("slippage_pips").notNull().default(0.5),
    /** "running" | "completed" | "error" */
    status: t.text().notNull().default("running"),
    /** JSON blob with full BacktestMetrics object */
    metrics: t.jsonb(),
    /** JSON array of warning strings */
    warnings: t.jsonb(),
    /** Total closed trades */
    totalTrades: t.integer("total_trades"),
    /** Total bars processed (after warmup) */
    totalBars: t.integer("total_bars"),
    /** Wall-clock duration in milliseconds */
    durationMs: t.integer("duration_ms"),
    /** When the backtest was triggered */
    startedAt: t
      .timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** When the backtest completed */
    completedAt: t.timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("backtest_runs_strategy_name_idx").on(table.strategyName),
    index("backtest_runs_started_at_idx").on(table.startedAt),
    index("backtest_runs_status_idx").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// Backtest Trades — simulated trades for each run
// ---------------------------------------------------------------------------

export const backtestTrades = pgTable(
  "backtest_trades",
  {
    id: t.serial().primaryKey(),
    /** FK to backtest_runs.id */
    runId: t.integer("run_id").notNull(),
    /** Instrument epic */
    epic: t.text().notNull(),
    /** Strategy that generated the signal */
    strategy: t.text().notNull(),
    /** "BUY" | "SELL" */
    direction: t.text().notNull(),
    /** Position size */
    size: t.doublePrecision().notNull(),
    /** Entry fill price (close + spread + slippage) */
    entryPrice: t.doublePrecision("entry_price").notNull(),
    /** Exit fill price */
    exitPrice: t.doublePrecision("exit_price").notNull(),
    /** Bar index when entered */
    entryBar: t.integer("entry_bar").notNull(),
    /** Bar index when exited */
    exitBar: t.integer("exit_bar").notNull(),
    /** Bars held (exitBar - entryBar) */
    barsHeld: t.integer("bars_held").notNull(),
    /** Realised P&L */
    pnl: t.doublePrecision().notNull(),
    /** Realised P&L as fraction of entry price */
    pnlPct: t.doublePrecision("pnl_pct").notNull(),
    /** Stop level at entry */
    stopLevel: t.doublePrecision("stop_level"),
    /** Limit level at entry */
    limitLevel: t.doublePrecision("limit_level"),
    /** JSON blob with indicator data from entry signal */
    entrySignalData: t.jsonb("entry_signal_data"),
    /** "stop" | "limit" | "signal" | "forced_close" */
    exitReason: t.text("exit_reason").notNull(),
    /** Timestamp of entry bar */
    entryTimestamp: t.timestamp("entry_timestamp", { withTimezone: true }),
    /** Timestamp of exit bar */
    exitTimestamp: t.timestamp("exit_timestamp", { withTimezone: true }),
  },
  (table) => [
    index("backtest_trades_run_id_idx").on(table.runId),
    index("backtest_trades_epic_idx").on(table.epic),
    index("backtest_trades_strategy_idx").on(table.strategy),
  ],
);

// ---------------------------------------------------------------------------
// Backtest Equity — bar-by-bar equity curve per run
// ---------------------------------------------------------------------------

export const backtestEquity = pgTable(
  "backtest_equity",
  {
    id: t.serial().primaryKey(),
    /** FK to backtest_runs.id */
    runId: t.integer("run_id").notNull(),
    /** Bar index in the candle array */
    barIndex: t.integer("bar_index").notNull(),
    /** Timestamp of the bar */
    timestamp: t.timestamp({ withTimezone: true }),
    /** Total portfolio equity (cash + unrealised P&L) */
    equity: t.doublePrecision().notNull(),
    /** Available cash */
    cash: t.doublePrecision().notNull(),
    /** Unrealised P&L across all open positions */
    unrealizedPnl: t.doublePrecision("unrealized_pnl").notNull().default(0),
    /** Drawdown as fraction of peak (0 to -1) */
    drawdownPct: t.doublePrecision("drawdown_pct").notNull().default(0),
    /** Drawdown in absolute currency */
    drawdownAmount: t.doublePrecision("drawdown_amount").notNull().default(0),
    /** Open position count at this bar */
    openPositionCount: t.integer("open_position_count").notNull().default(0),
  },
  (table) => [
    index("backtest_equity_run_id_idx").on(table.runId),
    index("backtest_equity_bar_index_idx").on(table.barIndex),
  ],
);
