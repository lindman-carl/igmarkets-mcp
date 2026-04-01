/**
 * Drizzle ORM Schema - Trading Bot State Persistence
 *
 * PostgreSQL tables for persisting bot state between ticks:
 * - strategies: strategy definitions with markdown prompts
 * - accounts: IG trading accounts, each linked to a strategy (no credentials)
 * - instruments: local market/instrument master data cache
 * - account_snapshots: periodic equity curve snapshots
 * - candles: local price data cache
 * - ticks: record of each bot execution cycle (scoped per account)
 * - signals: strategy signals generated per tick
 * - trades: trade executions and their outcomes
 * - positions: tracked open positions and their lifecycle
 * - risk_state: typed circuit breaker / risk state per account
 */

import { pgTable, index, uniqueIndex, unique } from "drizzle-orm/pg-core";
import * as t from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// Backtest tables — defined in src/bot/backtest/tables.ts
// Re-exported here so that the Drizzle schema object used in createDatabase()
// and createTestDb() picks them up automatically.
// ---------------------------------------------------------------------------

export {
  backtestRuns,
  backtestTrades,
  backtestEquity,
} from "../bot/backtest/tables.js";

// ---------------------------------------------------------------------------
// Strategies — named strategy configurations with markdown prompts
// ---------------------------------------------------------------------------

export const strategies = pgTable(
  "strategies",
  {
    id: t.serial().primaryKey(),
    /** Unique strategy name */
    name: t.text().notNull().unique(),
    /**
     * Free-form markdown prompt with YAML frontmatter header.
     * The frontmatter contains structured metadata (tickers, risk params, etc.)
     * and the body contains free-form trading rules / instructions.
     */
    prompt: t.text().notNull(),
    /** Base strategy type (e.g. "trend-following", "breakout", or custom) */
    strategyType: t.text("strategy_type").notNull(),
    /** JSON blob with strategy parameters (SMA periods, ATR multipliers, etc.) */
    strategyParams: t.jsonb("strategy_params"),
    /** JSON blob with risk configuration overrides */
    riskConfig: t.jsonb("risk_config"),
    /** Whether this strategy is active and available for use */
    isActive: t.boolean("is_active").notNull().default(true),
    /** Timestamp of creation */
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Timestamp of last update */
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("strategies_is_active_idx").on(table.isActive)],
);

// ---------------------------------------------------------------------------
// Accounts — IG trading accounts, each linked to a strategy
// Credentials are read from environment variables, not stored in the DB.
// ---------------------------------------------------------------------------

export const accounts = pgTable(
  "accounts",
  {
    id: t.serial().primaryKey(),
    /** Unique account display name (e.g. "UK Indices Demo") */
    name: t.text().notNull().unique(),
    /** Use demo environment */
    isDemo: t.boolean("is_demo").notNull().default(true),
    /** FK to strategies table */
    strategyId: t.integer("strategy_id").notNull(),
    /** Tick interval in minutes (5, 10, 15, 60) */
    intervalMinutes: t.integer("interval_minutes").notNull().default(15),
    /** IANA timezone (e.g. "Europe/London") */
    timezone: t.text().notNull().default("Europe/London"),
    /** Whether this account is active and should be processed */
    isActive: t.boolean("is_active").notNull().default(true),
    /** Timestamp of creation */
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Timestamp of last update */
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("accounts_strategy_id_idx").on(table.strategyId),
    index("accounts_is_active_idx").on(table.isActive),
  ],
);

// ---------------------------------------------------------------------------
// Instruments — local market/instrument master data cache
// ---------------------------------------------------------------------------

export const instruments = pgTable(
  "instruments",
  {
    id: t.serial().primaryKey(),
    /** IG epic identifier (e.g. "IX.D.FTSE.DAILY.IP") */
    epic: t.text().notNull().unique(),
    /** Human-readable instrument name */
    name: t.text().notNull(),
    /** Minimum deal size */
    minDealSize: t.doublePrecision("min_deal_size").notNull(),
    /** Minimum tick/pip size */
    tickSize: t.doublePrecision("tick_size"),
    /** Margin factor (e.g. 0.05 = 5% margin) */
    marginFactor: t.doublePrecision("margin_factor"),
    /** Currency code for the instrument (e.g. "GBP", "USD") */
    currencyCode: t.text("currency_code").notNull(),
    /** Default expiry (e.g. "DFB", "-") */
    expiry: t.text(),
    /** JSON blob with trading hours info */
    tradingHours: t.jsonb("trading_hours"),
    /** When this instrument record was last synced from IG API */
    lastSyncedAt: t.timestamp("last_synced_at", { withTimezone: true }),
    /** Timestamp of creation */
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("instruments_currency_code_idx").on(table.currencyCode)],
);

// ---------------------------------------------------------------------------
// Account Snapshots — periodic equity curve snapshots
// ---------------------------------------------------------------------------

export const accountSnapshots = pgTable(
  "account_snapshots",
  {
    id: t.serial().primaryKey(),
    /** FK to accounts table */
    accountId: t.integer("account_id").notNull(),
    /** Account balance */
    balance: t.doublePrecision().notNull(),
    /** Account equity (balance + unrealized P&L) */
    equity: t.doublePrecision().notNull(),
    /** Margin in use */
    margin: t.doublePrecision().notNull().default(0),
    /** Unrealized profit/loss */
    profitLoss: t.doublePrecision("profit_loss").notNull().default(0),
    /** Available funds (equity - margin) */
    availableFunds: t.doublePrecision("available_funds").notNull().default(0),
    /** When this snapshot was taken */
    snapshotAt: t
      .timestamp("snapshot_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("account_snapshots_account_id_idx").on(table.accountId),
    index("account_snapshots_snapshot_at_idx").on(table.snapshotAt),
  ],
);

// ---------------------------------------------------------------------------
// Candles — local price data cache
// ---------------------------------------------------------------------------

export const candles = pgTable(
  "candles",
  {
    id: t.serial().primaryKey(),
    /** IG epic identifier */
    epic: t.text().notNull(),
    /** Price resolution (e.g. "MINUTE_5", "HOUR", "DAY") */
    resolution: t.text().notNull(),
    /** Candle timestamp */
    timestamp: t.timestamp({ withTimezone: true }).notNull(),
    /** Open price */
    open: t.doublePrecision().notNull(),
    /** High price */
    high: t.doublePrecision().notNull(),
    /** Low price */
    low: t.doublePrecision().notNull(),
    /** Close price */
    close: t.doublePrecision().notNull(),
    /** Volume (may be null for some instruments) */
    volume: t.doublePrecision(),
  },
  (table) => [
    unique("candles_epic_resolution_timestamp_uq").on(
      table.epic,
      table.resolution,
      table.timestamp,
    ),
    index("candles_epic_resolution_idx").on(table.epic, table.resolution),
    index("candles_timestamp_idx").on(table.timestamp),
  ],
);

// ---------------------------------------------------------------------------
// Ticks — one row per bot execution cycle
// ---------------------------------------------------------------------------

export const ticks = pgTable(
  "ticks",
  {
    id: t.serial().primaryKey(),
    /** FK to accounts table (null for legacy single-account ticks) */
    accountId: t.integer("account_id"),
    /** Timestamp of tick start */
    startedAt: t
      .timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Timestamp of tick end */
    completedAt: t.timestamp("completed_at", { withTimezone: true }),
    /** "running" | "completed" | "skipped" | "error" */
    status: t.text().notNull().default("running"),
    /** Number of instruments scanned */
    instrumentsScanned: t.integer("instruments_scanned").default(0),
    /** Number of signals generated */
    signalsGenerated: t.integer("signals_generated").default(0),
    /** Number of trades executed */
    tradesExecuted: t.integer("trades_executed").default(0),
    /** Error message if status is "error" */
    error: t.text(),
    /** Free-form JSON metadata */
    metadata: t.jsonb(),
  },
  (table) => [
    index("ticks_started_at_idx").on(table.startedAt),
    index("ticks_account_id_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Signals — strategy signals generated during ticks
// ---------------------------------------------------------------------------

export const signals = pgTable(
  "signals",
  {
    id: t.serial().primaryKey(),
    /** FK to accounts table */
    accountId: t.integer("account_id"),
    tickId: t.integer("tick_id").notNull(),
    /** Instrument epic (e.g. "IX.D.FTSE.DAILY.IP") */
    epic: t.text().notNull(),
    /** "trend-following" | "breakout" | "mean-reversion" | "sentiment-contrarian" */
    strategy: t.text().notNull(),
    /** "buy" | "sell" | "close" | "hold" */
    action: t.text().notNull(),
    /** "entry" | "exit" | "adjust" */
    signalType: t.text("signal_type").notNull(),
    /** Confidence score 0-1 */
    confidence: t.doublePrecision(),
    /** Price at time of signal */
    priceAtSignal: t.doublePrecision("price_at_signal"),
    /** Suggested stop level */
    suggestedStop: t.doublePrecision("suggested_stop"),
    /** Suggested limit/target level */
    suggestedLimit: t.doublePrecision("suggested_limit"),
    /** Suggested position size */
    suggestedSize: t.doublePrecision("suggested_size"),
    /** Whether this signal was acted on */
    acted: t.boolean().default(false),
    /** Reason if not acted on (e.g. "circuit_breaker", "max_positions") */
    skipReason: t.text("skip_reason"),
    /** Timestamp of signal creation */
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** JSON blob with indicator values, sentiment data, etc. */
    indicatorData: t.jsonb("indicator_data"),
  },
  (table) => [
    index("signals_tick_id_idx").on(table.tickId),
    index("signals_epic_idx").on(table.epic),
    index("signals_created_at_idx").on(table.createdAt),
    index("signals_account_id_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Trades — executed trade operations
// ---------------------------------------------------------------------------

export const trades = pgTable(
  "trades",
  {
    id: t.serial().primaryKey(),
    /** FK to accounts table */
    accountId: t.integer("account_id"),
    tickId: t.integer("tick_id").notNull(),
    signalId: t.integer("signal_id"),
    /** IG deal reference returned from trade operation */
    dealReference: t.text("deal_reference"),
    /** IG deal ID (from deal confirmation) */
    dealId: t.text("deal_id"),
    epic: t.text().notNull(),
    /** "BUY" | "SELL" */
    direction: t.text().notNull(),
    size: t.doublePrecision().notNull(),
    /** "MARKET" | "LIMIT" | "STOP" */
    orderType: t.text("order_type").notNull(),
    /** Price at which the trade was executed */
    executionPrice: t.doublePrecision("execution_price"),
    /** Stop level set on the trade */
    stopLevel: t.doublePrecision("stop_level"),
    /** Limit level set on the trade */
    limitLevel: t.doublePrecision("limit_level"),
    /** "OPEN" | "REJECTED" | "PENDING" */
    status: t.text().notNull().default("PENDING"),
    /** Rejection reason from IG */
    rejectReason: t.text("reject_reason"),
    /** Currency code */
    currencyCode: t.text("currency_code").notNull(),
    /** Instrument expiry (e.g. "DFB") */
    expiry: t.text().notNull(),
    /** Timestamp of trade creation */
    createdAt: t
      .timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** JSON blob with full deal confirmation response */
    confirmationData: t.jsonb("confirmation_data"),
  },
  (table) => [
    index("trades_tick_id_idx").on(table.tickId),
    index("trades_deal_id_idx").on(table.dealId),
    index("trades_epic_idx").on(table.epic),
    index("trades_created_at_idx").on(table.createdAt),
    index("trades_account_id_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Positions — tracked open positions and their lifecycle
// ---------------------------------------------------------------------------

export const positions = pgTable(
  "positions",
  {
    id: t.serial().primaryKey(),
    /** FK to accounts table */
    accountId: t.integer("account_id"),
    /** IG deal ID */
    dealId: t.text("deal_id").notNull().unique(),
    epic: t.text().notNull(),
    /** "BUY" | "SELL" */
    direction: t.text().notNull(),
    size: t.doublePrecision().notNull(),
    /** Entry price */
    entryPrice: t.doublePrecision("entry_price").notNull(),
    /** Current stop level */
    currentStop: t.doublePrecision("current_stop"),
    /** Current limit level */
    currentLimit: t.doublePrecision("current_limit"),
    /** Strategy that opened this position */
    strategy: t.text(),
    /** "open" | "closed" | "unknown" */
    status: t.text().notNull().default("open"),
    /** Exit price (when closed) */
    exitPrice: t.doublePrecision("exit_price"),
    /** Realized P&L (when closed) */
    realizedPnl: t.doublePrecision("realized_pnl"),
    /** Currency code */
    currencyCode: t.text("currency_code").notNull(),
    /** Instrument expiry */
    expiry: t.text().notNull(),
    /** Timestamp of position open */
    openedAt: t
      .timestamp("opened_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    /** Timestamp of position close */
    closedAt: t.timestamp("closed_at", { withTimezone: true }),
    /** ID of the trade that opened this position */
    openTradeId: t.integer("open_trade_id"),
    /** ID of the trade that closed this position */
    closeTradeId: t.integer("close_trade_id"),
    /** JSON blob with extra metadata */
    metadata: t.jsonb(),
  },
  (table) => [
    index("positions_epic_idx").on(table.epic),
    index("positions_status_idx").on(table.status),
    index("positions_account_id_idx").on(table.accountId),
  ],
);

// ---------------------------------------------------------------------------
// Risk State — typed circuit breaker / risk state per account
// Replaces the generic bot_state KV table with proper schema enforcement.
// ---------------------------------------------------------------------------

export const riskState = pgTable(
  "risk_state",
  {
    id: t.serial().primaryKey(),
    /** FK to accounts table (null = global) */
    accountId: t.integer("account_id").unique(),
    /** Whether the circuit breaker is currently tripped */
    tripped: t.boolean().notNull().default(false),
    /** Number of consecutive losing trades */
    consecutiveLosses: t.integer("consecutive_losses").notNull().default(0),
    /** Number of consecutive errors */
    consecutiveErrors: t.integer("consecutive_errors").notNull().default(0),
    /** When the circuit breaker was last tripped */
    lastTrippedAt: t.timestamp("last_tripped_at", { withTimezone: true }),
    /** When the cooldown period expires */
    cooldownUntil: t.timestamp("cooldown_until", { withTimezone: true }),
    /** Total losses today */
    totalLossesToday: t
      .doublePrecision("total_losses_today")
      .notNull()
      .default(0),
    /** Daily P&L running total */
    dailyPnl: t.doublePrecision("daily_pnl").notNull().default(0),
    /** Date of last daily reset (ISO date string, e.g. "2026-04-01") */
    lastDailyResetDate: t.text("last_daily_reset_date"),
    /** Last update timestamp */
    updatedAt: t
      .timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("risk_state_account_id_idx").on(table.accountId)],
);
