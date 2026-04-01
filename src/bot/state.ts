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
import {
  ticks,
  signals,
  trades,
  positions,
  botState,
  strategies,
  accounts,
} from "../db/schema.js";
import {
  InsertTickSchema,
  InsertSignalSchema,
  InsertTradeSchema,
  InsertPositionSchema,
  InsertStrategySchema,
  InsertAccountSchema,
  CircuitBreakerStateSchema,
  DEFAULT_CIRCUIT_BREAKER_STATE,
  type InsertTick,
  type InsertSignal,
  type InsertTrade,
  type InsertPosition,
  type InsertStrategy,
  type InsertAccount,
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
type StrategyRow = typeof strategies.$inferSelect;
type AccountRow = typeof accounts.$inferSelect;

// Re-export row types for consumers
export type {
  TickRow,
  SignalRow,
  TradeRow,
  PositionRow,
  StrategyRow,
  AccountRow,
};

// ---------------------------------------------------------------------------
// Tick Operations
// ---------------------------------------------------------------------------

/**
 * Start a new tick and return its ID.
 * @param accountId - Optional account ID for multi-account scoping
 */
export async function startTick(
  db: BotDatabase,
  data: InsertTick,
  accountId?: number,
): Promise<number> {
  const validated = InsertTickSchema.parse(data);
  const result = await db
    .insert(ticks)
    .values({ ...validated, accountId: accountId ?? null })
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
 * @param accountId - Optional account ID for multi-account scoping
 */
export async function insertSignal(
  db: BotDatabase,
  data: InsertSignal,
  accountId?: number,
): Promise<number> {
  const validated = InsertSignalSchema.parse(data);
  const result = await db
    .insert(signals)
    .values({ ...validated, accountId: accountId ?? null })
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
 * @param accountId - Optional account ID for multi-account scoping
 */
export async function insertTrade(
  db: BotDatabase,
  data: InsertTrade,
  accountId?: number,
): Promise<number> {
  const validated = InsertTradeSchema.parse(data);
  const result = await db
    .insert(trades)
    .values({ ...validated, accountId: accountId ?? null })
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
 * @param accountId - Optional account ID for multi-account scoping
 */
export async function insertPosition(
  db: BotDatabase,
  data: InsertPosition,
  accountId?: number,
): Promise<number> {
  const validated = InsertPositionSchema.parse(data);
  const result = await db
    .insert(positions)
    .values({ ...validated, accountId: accountId ?? null })
    .returning({ id: positions.id });
  return result[0].id;
}

/**
 * Get all open positions tracked by the bot.
 * @param accountId - Optional account ID to filter positions
 */
export async function getOpenPositions(
  db: BotDatabase,
  accountId?: number,
): Promise<PositionRow[]> {
  if (accountId != null) {
    return db
      .select()
      .from(positions)
      .where(
        and(
          eq(positions.status, "open"),
          eq(positions.accountId, accountId),
        ),
      )
      .orderBy(desc(positions.id));
  }
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
 * Build a circuit breaker key scoped to an account (or global).
 */
function cbKey(accountId?: number): string {
  return accountId != null
    ? `${CIRCUIT_BREAKER_KEY}:account:${accountId}`
    : CIRCUIT_BREAKER_KEY;
}

/**
 * Get the current circuit breaker state.
 * @param accountId - Optional account ID for per-account scoping
 */
export async function getCircuitBreakerState(
  db: BotDatabase,
  accountId?: number,
): Promise<CircuitBreakerState> {
  const raw = await getState(db, cbKey(accountId));
  if (!raw) return { ...DEFAULT_CIRCUIT_BREAKER_STATE };

  const result = CircuitBreakerStateSchema.safeParse(raw);
  if (!result.success) return { ...DEFAULT_CIRCUIT_BREAKER_STATE };
  return result.data;
}

/**
 * Update the circuit breaker state.
 * @param accountId - Optional account ID for per-account scoping
 */
export async function setCircuitBreakerState(
  db: BotDatabase,
  state: CircuitBreakerState,
  accountId?: number,
): Promise<void> {
  const validated = CircuitBreakerStateSchema.parse(state);
  await setState(db, cbKey(accountId), validated);
}

// ---------------------------------------------------------------------------
// Strategy Operations
// ---------------------------------------------------------------------------

/**
 * Insert a new strategy and return its ID.
 */
export async function insertStrategy(
  db: BotDatabase,
  data: InsertStrategy,
): Promise<number> {
  const validated = InsertStrategySchema.parse(data);
  const result = await db
    .insert(strategies)
    .values(validated)
    .returning({ id: strategies.id });
  return result[0].id;
}

/**
 * Get a strategy by ID.
 */
export async function getStrategy(
  db: BotDatabase,
  id: number,
): Promise<StrategyRow | null> {
  const rows = await db
    .select()
    .from(strategies)
    .where(eq(strategies.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get a strategy by its unique name.
 */
export async function getStrategyByName(
  db: BotDatabase,
  name: string,
): Promise<StrategyRow | null> {
  const rows = await db
    .select()
    .from(strategies)
    .where(eq(strategies.name, name))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get all active strategies.
 */
export async function getActiveStrategies(
  db: BotDatabase,
): Promise<StrategyRow[]> {
  return db
    .select()
    .from(strategies)
    .where(eq(strategies.isActive, true))
    .orderBy(desc(strategies.id));
}

/**
 * Update a strategy's fields.
 */
export async function updateStrategy(
  db: BotDatabase,
  id: number,
  data: Partial<{
    name: string;
    prompt: string;
    strategyType: string;
    strategyParams: unknown;
    riskConfig: unknown;
    isActive: boolean;
  }>,
): Promise<void> {
  await db
    .update(strategies)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(strategies.id, id));
}

/**
 * Delete a strategy by ID.
 */
export async function deleteStrategy(
  db: BotDatabase,
  id: number,
): Promise<void> {
  await db.delete(strategies).where(eq(strategies.id, id));
}

// ---------------------------------------------------------------------------
// Account Operations
// ---------------------------------------------------------------------------

/**
 * Insert a new account and return its ID.
 */
export async function insertAccount(
  db: BotDatabase,
  data: InsertAccount,
): Promise<number> {
  const validated = InsertAccountSchema.parse(data);
  const result = await db
    .insert(accounts)
    .values(validated)
    .returning({ id: accounts.id });
  return result[0].id;
}

/**
 * Get an account by ID.
 */
export async function getAccount(
  db: BotDatabase,
  id: number,
): Promise<AccountRow | null> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.id, id))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get an account by its unique name.
 */
export async function getAccountByName(
  db: BotDatabase,
  name: string,
): Promise<AccountRow | null> {
  const rows = await db
    .select()
    .from(accounts)
    .where(eq(accounts.name, name))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get all active accounts.
 */
export async function getActiveAccounts(
  db: BotDatabase,
): Promise<AccountRow[]> {
  return db
    .select()
    .from(accounts)
    .where(eq(accounts.isActive, true))
    .orderBy(desc(accounts.id));
}

/**
 * Update an account's fields.
 */
export async function updateAccount(
  db: BotDatabase,
  id: number,
  data: Partial<{
    name: string;
    igApiKey: string;
    igUsername: string;
    igPassword: string;
    isDemo: boolean;
    strategyId: number;
    intervalMinutes: number;
    timezone: string;
    isActive: boolean;
  }>,
): Promise<void> {
  await db
    .update(accounts)
    .set({
      ...data,
      updatedAt: new Date().toISOString(),
    })
    .where(eq(accounts.id, id));
}

/**
 * Delete an account by ID.
 */
export async function deleteAccount(
  db: BotDatabase,
  id: number,
): Promise<void> {
  await db.delete(accounts).where(eq(accounts.id, id));
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
