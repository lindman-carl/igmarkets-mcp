/**
 * Drizzle ORM Schema - Trading Bot State Persistence
 *
 * SQLite tables for persisting bot state between ticks:
 * - ticks: record of each bot execution cycle
 * - signals: strategy signals generated per tick
 * - trades: trade executions and their outcomes
 * - positions: tracked open positions and their lifecycle
 * - bot_state: key-value store for misc bot state (circuit breaker, etc.)
 */

import { sqliteTable, index } from "drizzle-orm/sqlite-core";
import * as t from "drizzle-orm/sqlite-core";

// ---------------------------------------------------------------------------
// Ticks — one row per bot execution cycle
// ---------------------------------------------------------------------------

export const ticks = sqliteTable(
  "ticks",
  {
    id: t.int().primaryKey({ autoIncrement: true }),
    /** ISO 8601 timestamp of tick start */
    startedAt: t.text("started_at").notNull(),
    /** ISO 8601 timestamp of tick end */
    completedAt: t.text("completed_at"),
    /** "running" | "completed" | "skipped" | "error" */
    status: t.text().notNull().default("running"),
    /** Number of instruments scanned */
    instrumentsScanned: t.int("instruments_scanned").default(0),
    /** Number of signals generated */
    signalsGenerated: t.int("signals_generated").default(0),
    /** Number of trades executed */
    tradesExecuted: t.int("trades_executed").default(0),
    /** Error message if status is "error" */
    error: t.text(),
    /** Free-form JSON metadata */
    metadata: t.text({ mode: "json" }),
  },
  (table) => [index("ticks_started_at_idx").on(table.startedAt)],
);

// ---------------------------------------------------------------------------
// Signals — strategy signals generated during ticks
// ---------------------------------------------------------------------------

export const signals = sqliteTable(
  "signals",
  {
    id: t.int().primaryKey({ autoIncrement: true }),
    tickId: t.int("tick_id").notNull(),
    /** Instrument epic (e.g. "IX.D.FTSE.DAILY.IP") */
    epic: t.text().notNull(),
    /** "trend-following" | "breakout" | "mean-reversion" | "sentiment-contrarian" */
    strategy: t.text().notNull(),
    /** "buy" | "sell" | "close" | "hold" */
    action: t.text().notNull(),
    /** "entry" | "exit" | "adjust" */
    signalType: t.text("signal_type").notNull(),
    /** Confidence score 0-1 */
    confidence: t.real(),
    /** Price at time of signal */
    priceAtSignal: t.real("price_at_signal"),
    /** Suggested stop level */
    suggestedStop: t.real("suggested_stop"),
    /** Suggested limit/target level */
    suggestedLimit: t.real("suggested_limit"),
    /** Suggested position size */
    suggestedSize: t.real("suggested_size"),
    /** Whether this signal was acted on */
    acted: t.int({ mode: "boolean" }).default(false),
    /** Reason if not acted on (e.g. "circuit_breaker", "max_positions") */
    skipReason: t.text("skip_reason"),
    /** ISO 8601 timestamp */
    createdAt: t.text("created_at").notNull(),
    /** JSON blob with indicator values, sentiment data, etc. */
    indicatorData: t.text("indicator_data", { mode: "json" }),
  },
  (table) => [
    index("signals_tick_id_idx").on(table.tickId),
    index("signals_epic_idx").on(table.epic),
    index("signals_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Trades — executed trade operations
// ---------------------------------------------------------------------------

export const trades = sqliteTable(
  "trades",
  {
    id: t.int().primaryKey({ autoIncrement: true }),
    tickId: t.int("tick_id").notNull(),
    signalId: t.int("signal_id"),
    /** IG deal reference returned from trade operation */
    dealReference: t.text("deal_reference"),
    /** IG deal ID (from deal confirmation) */
    dealId: t.text("deal_id"),
    epic: t.text().notNull(),
    /** "BUY" | "SELL" */
    direction: t.text().notNull(),
    size: t.real().notNull(),
    /** "MARKET" | "LIMIT" | "STOP" */
    orderType: t.text("order_type").notNull(),
    /** Price at which the trade was executed */
    executionPrice: t.real("execution_price"),
    /** Stop level set on the trade */
    stopLevel: t.real("stop_level"),
    /** Limit level set on the trade */
    limitLevel: t.real("limit_level"),
    /** "OPEN" | "REJECTED" | "PENDING" */
    status: t.text().notNull().default("PENDING"),
    /** Rejection reason from IG */
    rejectReason: t.text("reject_reason"),
    /** Currency code */
    currencyCode: t.text("currency_code").notNull(),
    /** Instrument expiry (e.g. "DFB") */
    expiry: t.text().notNull(),
    /** ISO 8601 timestamp */
    createdAt: t.text("created_at").notNull(),
    /** JSON blob with full deal confirmation response */
    confirmationData: t.text("confirmation_data", { mode: "json" }),
  },
  (table) => [
    index("trades_tick_id_idx").on(table.tickId),
    index("trades_deal_id_idx").on(table.dealId),
    index("trades_epic_idx").on(table.epic),
    index("trades_created_at_idx").on(table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Positions — tracked open positions and their lifecycle
// ---------------------------------------------------------------------------

export const positions = sqliteTable(
  "positions",
  {
    id: t.int().primaryKey({ autoIncrement: true }),
    /** IG deal ID */
    dealId: t.text("deal_id").notNull().unique(),
    epic: t.text().notNull(),
    /** "BUY" | "SELL" */
    direction: t.text().notNull(),
    size: t.real().notNull(),
    /** Entry price */
    entryPrice: t.real("entry_price").notNull(),
    /** Current stop level */
    currentStop: t.real("current_stop"),
    /** Current limit level */
    currentLimit: t.real("current_limit"),
    /** Strategy that opened this position */
    strategy: t.text(),
    /** "open" | "closed" | "unknown" */
    status: t.text().notNull().default("open"),
    /** Exit price (when closed) */
    exitPrice: t.real("exit_price"),
    /** Realized P&L (when closed) */
    realizedPnl: t.real("realized_pnl"),
    /** Currency code */
    currencyCode: t.text("currency_code").notNull(),
    /** Instrument expiry */
    expiry: t.text().notNull(),
    /** ISO 8601 timestamp of position open */
    openedAt: t.text("opened_at").notNull(),
    /** ISO 8601 timestamp of position close */
    closedAt: t.text("closed_at"),
    /** ID of the trade that opened this position */
    openTradeId: t.int("open_trade_id"),
    /** ID of the trade that closed this position */
    closeTradeId: t.int("close_trade_id"),
    /** JSON blob with extra metadata */
    metadata: t.text({ mode: "json" }),
  },
  (table) => [
    index("positions_epic_idx").on(table.epic),
    index("positions_status_idx").on(table.status),
  ],
);

// ---------------------------------------------------------------------------
// Bot State — key-value store for misc state
// ---------------------------------------------------------------------------

export const botState = sqliteTable("bot_state", {
  key: t.text().primaryKey(),
  value: t.text({ mode: "json" }).notNull(),
  /** ISO 8601 timestamp of last update */
  updatedAt: t.text("updated_at").notNull(),
});
