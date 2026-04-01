/**
 * State Persistence Layer - Trading Bot
 *
 * Provides CRUD operations for bot state using Drizzle ORM + SQLite.
 * All data is validated through Zod v4 schemas before insertion.
 *
 * Note: Return types use Drizzle's inferred row types (with `string` for
 * text columns) rather than the narrower Zod enum types. Callers should
 * validate with Zod schemas if they need the narrow types.
 */

import { eq, desc, and, sql } from "drizzle-orm";
import type { BotDatabase } from "../db/connection.js";
import { ticks, signals, trades, positions, botState } from "../db/schema.js";
import {
  InsertTickSchema,
  InsertSignalSchema,
  InsertTradeSchema,
  InsertPositionSchema,
  CircuitBreakerStateSchema,
  DEFAULT_CIRCUIT_BREAKER_STATE,
  type InsertTick,
  type InsertSignal,
  type InsertTrade,
  type InsertPosition,
  type CircuitBreakerState,
  type TickStatus,
  type TradeStatus,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Row types inferred from Drizzle schema (text columns are `string`)
// ---------------------------------------------------------------------------

type TickRow = typeof ticks.$inferSelect;
type SignalRow = typeof signals.$inferSelect;
type TradeRow = typeof trades.$inferSelect;
type PositionRow = typeof positions.$inferSelect;

// Re-export row types for consumers
export type { TickRow, SignalRow, TradeRow, PositionRow };

// ---------------------------------------------------------------------------
// Tick Operations
// ---------------------------------------------------------------------------

/**
 * Start a new tick and return its ID.
 */
export async function startTick(
  db: BotDatabase,
  data: InsertTick,
): Promise<number> {
  const validated = InsertTickSchema.parse(data);
  const result = await db
    .insert(ticks)
    .values(validated)
    .returning({ id: ticks.id });
  return result[0].id;
}

/**
 * Complete a tick with final status and stats.
 */
export async function completeTick(
  db: BotDatabase,
  tickId: number,
  update: {
    status: TickStatus;
    completedAt: string;
    instrumentsScanned?: number;
    signalsGenerated?: number;
    tradesExecuted?: number;
    error?: string;
    metadata?: unknown;
  },
): Promise<void> {
  await db
    .update(ticks)
    .set({
      status: update.status,
      completedAt: update.completedAt,
      instrumentsScanned: update.instrumentsScanned,
      signalsGenerated: update.signalsGenerated,
      tradesExecuted: update.tradesExecuted,
      error: update.error,
      metadata: update.metadata,
    })
    .where(eq(ticks.id, tickId));
}

/**
 * Get the most recent completed tick.
 */
export async function getLastTick(db: BotDatabase): Promise<TickRow | null> {
  const rows = await db
    .select()
    .from(ticks)
    .where(eq(ticks.status, "completed"))
    .orderBy(desc(ticks.id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get recent ticks for logging/review.
 */
export async function getRecentTicks(
  db: BotDatabase,
  limit = 20,
): Promise<TickRow[]> {
  return db.select().from(ticks).orderBy(desc(ticks.id)).limit(limit);
}

// ---------------------------------------------------------------------------
// Signal Operations
// ---------------------------------------------------------------------------

/**
 * Record a strategy signal generated during a tick.
 */
export async function insertSignal(
  db: BotDatabase,
  data: InsertSignal,
): Promise<number> {
  const validated = InsertSignalSchema.parse(data);
  const result = await db
    .insert(signals)
    .values(validated)
    .returning({ id: signals.id });
  return result[0].id;
}

/**
 * Mark a signal as acted upon.
 */
export async function markSignalActed(
  db: BotDatabase,
  signalId: number,
): Promise<void> {
  await db.update(signals).set({ acted: true }).where(eq(signals.id, signalId));
}

/**
 * Mark a signal as skipped with a reason.
 */
export async function markSignalSkipped(
  db: BotDatabase,
  signalId: number,
  reason: string,
): Promise<void> {
  await db
    .update(signals)
    .set({ acted: false, skipReason: reason })
    .where(eq(signals.id, signalId));
}

/**
 * Get signals for a specific tick.
 */
export async function getSignalsByTick(
  db: BotDatabase,
  tickId: number,
): Promise<SignalRow[]> {
  return db
    .select()
    .from(signals)
    .where(eq(signals.tickId, tickId))
    .orderBy(desc(signals.id));
}

/**
 * Get recent signals for an instrument.
 */
export async function getRecentSignals(
  db: BotDatabase,
  epic: string,
  limit = 10,
): Promise<SignalRow[]> {
  return db
    .select()
    .from(signals)
    .where(eq(signals.epic, epic))
    .orderBy(desc(signals.id))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Trade Operations
// ---------------------------------------------------------------------------

/**
 * Record a trade execution.
 */
export async function insertTrade(
  db: BotDatabase,
  data: InsertTrade,
): Promise<number> {
  const validated = InsertTradeSchema.parse(data);
  const result = await db
    .insert(trades)
    .values(validated)
    .returning({ id: trades.id });
  return result[0].id;
}

/**
 * Update a trade with deal confirmation results.
 */
export async function updateTradeConfirmation(
  db: BotDatabase,
  tradeId: number,
  update: {
    dealId?: string;
    executionPrice?: number;
    status: TradeStatus;
    rejectReason?: string;
    confirmationData?: unknown;
  },
): Promise<void> {
  await db
    .update(trades)
    .set({
      dealId: update.dealId,
      executionPrice: update.executionPrice,
      status: update.status,
      rejectReason: update.rejectReason,
      confirmationData: update.confirmationData,
    })
    .where(eq(trades.id, tradeId));
}

/**
 * Get trades for a specific tick.
 */
export async function getTradesByTick(
  db: BotDatabase,
  tickId: number,
): Promise<TradeRow[]> {
  return db
    .select()
    .from(trades)
    .where(eq(trades.tickId, tickId))
    .orderBy(desc(trades.id));
}

/**
 * Get recent trades across all ticks.
 */
export async function getRecentTrades(
  db: BotDatabase,
  limit = 20,
): Promise<TradeRow[]> {
  return db.select().from(trades).orderBy(desc(trades.id)).limit(limit);
}

/**
 * Get trades for a specific day (for P&L calculation).
 * @param todayPrefix - ISO date prefix, e.g. "2026-04-01"
 */
export async function getTradesToday(
  db: BotDatabase,
  todayPrefix: string,
): Promise<TradeRow[]> {
  return db
    .select()
    .from(trades)
    .where(sql`${trades.createdAt} LIKE ${todayPrefix + "%"}`);
}

// ---------------------------------------------------------------------------
// Position Operations
// ---------------------------------------------------------------------------

/**
 * Record a new tracked position.
 */
export async function insertPosition(
  db: BotDatabase,
  data: InsertPosition,
): Promise<number> {
  const validated = InsertPositionSchema.parse(data);
  const result = await db
    .insert(positions)
    .values(validated)
    .returning({ id: positions.id });
  return result[0].id;
}

/**
 * Get all open positions tracked by the bot.
 */
export async function getOpenPositions(
  db: BotDatabase,
): Promise<PositionRow[]> {
  return db
    .select()
    .from(positions)
    .where(eq(positions.status, "open"))
    .orderBy(desc(positions.id));
}

/**
 * Get a tracked position by its IG deal ID.
 */
export async function getPositionByDealId(
  db: BotDatabase,
  dealId: string,
): Promise<PositionRow | null> {
  const rows = await db
    .select()
    .from(positions)
    .where(eq(positions.dealId, dealId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Update stop/limit levels on a tracked position.
 */
export async function updatePositionLevels(
  db: BotDatabase,
  dealId: string,
  update: {
    currentStop?: number | null;
    currentLimit?: number | null;
  },
): Promise<void> {
  await db
    .update(positions)
    .set({
      currentStop: update.currentStop,
      currentLimit: update.currentLimit,
    })
    .where(eq(positions.dealId, dealId));
}

/**
 * Close a tracked position.
 */
export async function closeTrackedPosition(
  db: BotDatabase,
  dealId: string,
  update: {
    exitPrice: number;
    realizedPnl: number;
    closedAt: string;
    closeTradeId?: number;
  },
): Promise<void> {
  await db
    .update(positions)
    .set({
      status: "closed",
      exitPrice: update.exitPrice,
      realizedPnl: update.realizedPnl,
      closedAt: update.closedAt,
      closeTradeId: update.closeTradeId,
    })
    .where(eq(positions.dealId, dealId));
}

/**
 * Get closed positions, optionally filtered by date.
 */
export async function getClosedPositions(
  db: BotDatabase,
  opts?: { since?: string; limit?: number },
): Promise<PositionRow[]> {
  if (opts?.since) {
    const query = db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.status, "closed"),
          sql`${positions.closedAt} >= ${opts.since}`,
        ),
      )
      .orderBy(desc(positions.closedAt));

    return opts.limit ? query.limit(opts.limit) : query;
  }

  const query = db
    .select()
    .from(positions)
    .where(eq(positions.status, "closed"))
    .orderBy(desc(positions.closedAt));

  return opts?.limit ? query.limit(opts.limit) : query;
}

// ---------------------------------------------------------------------------
// Bot State (key-value) Operations
// ---------------------------------------------------------------------------

/**
 * Get a value from the bot state store.
 */
export async function getState<T>(
  db: BotDatabase,
  key: string,
): Promise<T | null> {
  const rows = await db
    .select()
    .from(botState)
    .where(eq(botState.key, key))
    .limit(1);
  if (!rows[0]) return null;
  return rows[0].value as T;
}

/**
 * Set a value in the bot state store (upsert).
 */
export async function setState(
  db: BotDatabase,
  key: string,
  value: unknown,
): Promise<void> {
  const now = new Date().toISOString();
  await db
    .insert(botState)
    .values({ key, value, updatedAt: now })
    .onConflictDoUpdate({
      target: botState.key,
      set: { value, updatedAt: now },
    });
}

/**
 * Delete a value from the bot state store.
 */
export async function deleteState(db: BotDatabase, key: string): Promise<void> {
  await db.delete(botState).where(eq(botState.key, key));
}

// ---------------------------------------------------------------------------
// Circuit Breaker State (convenience wrappers)
// ---------------------------------------------------------------------------

const CIRCUIT_BREAKER_KEY = "circuit_breaker";

/**
 * Get the current circuit breaker state.
 */
export async function getCircuitBreakerState(
  db: BotDatabase,
): Promise<CircuitBreakerState> {
  const raw = await getState(db, CIRCUIT_BREAKER_KEY);
  if (!raw) return { ...DEFAULT_CIRCUIT_BREAKER_STATE };

  const result = CircuitBreakerStateSchema.safeParse(raw);
  if (!result.success) return { ...DEFAULT_CIRCUIT_BREAKER_STATE };
  return result.data;
}

/**
 * Update the circuit breaker state.
 */
export async function setCircuitBreakerState(
  db: BotDatabase,
  state: CircuitBreakerState,
): Promise<void> {
  const validated = CircuitBreakerStateSchema.parse(state);
  await setState(db, CIRCUIT_BREAKER_KEY, validated);
}

// ---------------------------------------------------------------------------
// Summary / Statistics
// ---------------------------------------------------------------------------

/**
 * Get a summary of bot activity since a given date.
 * @param since - ISO 8601 timestamp
 */
export async function getTickSummary(
  db: BotDatabase,
  since: string,
): Promise<{
  totalTicks: number;
  completedTicks: number;
  errorTicks: number;
  skippedTicks: number;
  totalSignals: number;
  totalTrades: number;
}> {
  const tickRows = await db
    .select()
    .from(ticks)
    .where(sql`${ticks.startedAt} >= ${since}`);

  const signalRows = await db
    .select()
    .from(signals)
    .where(sql`${signals.createdAt} >= ${since}`);

  const tradeRows = await db
    .select()
    .from(trades)
    .where(sql`${trades.createdAt} >= ${since}`);

  return {
    totalTicks: tickRows.length,
    completedTicks: tickRows.filter((t) => t.status === "completed").length,
    errorTicks: tickRows.filter((t) => t.status === "error").length,
    skippedTicks: tickRows.filter((t) => t.status === "skipped").length,
    totalSignals: signalRows.length,
    totalTrades: tradeRows.length,
  };
}
