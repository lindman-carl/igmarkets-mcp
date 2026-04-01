/**
 * State Persistence Layer - Trading Bot
 *
 * Provides CRUD operations for bot state using Drizzle ORM + PostgreSQL.
 * All data is validated through Zod v4 schemas before insertion.
 *
 * Note: Return types use Drizzle's inferred row types rather than the
 * narrower Zod enum types. Callers should validate with Zod schemas
 * if they need the narrow types.
 */

import { eq, desc, and, sql, gte, lte, isNull } from "drizzle-orm";
import type { BotDatabase } from "../db/connection.js";
import {
  ticks,
  signals,
  trades,
  positions,
  riskState,
  strategies,
  accounts,
  instruments,
  accountSnapshots,
  candles,
} from "../db/schema.js";
import {
  InsertTickSchema,
  InsertSignalSchema,
  InsertTradeSchema,
  InsertPositionSchema,
  InsertStrategySchema,
  InsertAccountSchema,
  InsertRiskStateSchema,
  InsertInstrumentSchema,
  InsertAccountSnapshotSchema,
  InsertCandleSchema,
  RiskStateSchema,
  DEFAULT_RISK_STATE,
  type InsertTick,
  type InsertSignal,
  type InsertTrade,
  type InsertPosition,
  type InsertStrategy,
  type InsertAccount,
  type InsertRiskState,
  type InsertInstrument,
  type InsertAccountSnapshot,
  type InsertCandle,
  type RiskState,
  type TickStatus,
  type TradeStatus,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Row types inferred from Drizzle schema
// ---------------------------------------------------------------------------

type TickRow = typeof ticks.$inferSelect;
type SignalRow = typeof signals.$inferSelect;
type TradeRow = typeof trades.$inferSelect;
type PositionRow = typeof positions.$inferSelect;
type StrategyRow = typeof strategies.$inferSelect;
type AccountRow = typeof accounts.$inferSelect;
type InstrumentRow = typeof instruments.$inferSelect;
type AccountSnapshotRow = typeof accountSnapshots.$inferSelect;
type CandleRow = typeof candles.$inferSelect;
type RiskStateRow = typeof riskState.$inferSelect;

// Re-export row types for consumers
export type {
  TickRow,
  SignalRow,
  TradeRow,
  PositionRow,
  StrategyRow,
  AccountRow,
  InstrumentRow,
  AccountSnapshotRow,
  CandleRow,
  RiskStateRow,
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
    .values({
      ...validated,
      startedAt:
        validated.startedAt instanceof Date
          ? validated.startedAt
          : new Date(validated.startedAt),
      accountId: accountId ?? null,
    })
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
    completedAt: string | Date;
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
      completedAt:
        update.completedAt instanceof Date
          ? update.completedAt
          : new Date(update.completedAt),
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
    .values({
      ...validated,
      createdAt:
        validated.createdAt instanceof Date
          ? validated.createdAt
          : new Date(validated.createdAt),
      accountId: accountId ?? null,
    })
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
    .values({
      ...validated,
      createdAt:
        validated.createdAt instanceof Date
          ? validated.createdAt
          : new Date(validated.createdAt),
      accountId: accountId ?? null,
    })
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
  const dayStart = new Date(`${todayPrefix}T00:00:00.000Z`);
  const dayEnd = new Date(`${todayPrefix}T23:59:59.999Z`);
  return db
    .select()
    .from(trades)
    .where(and(gte(trades.createdAt, dayStart), lte(trades.createdAt, dayEnd)));
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
    .values({
      ...validated,
      openedAt:
        validated.openedAt instanceof Date
          ? validated.openedAt
          : new Date(validated.openedAt),
      accountId: accountId ?? null,
    })
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
        and(eq(positions.status, "open"), eq(positions.accountId, accountId)),
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
    closedAt: string | Date;
    closeTradeId?: number;
  },
): Promise<void> {
  await db
    .update(positions)
    .set({
      status: "closed",
      exitPrice: update.exitPrice,
      realizedPnl: update.realizedPnl,
      closedAt:
        update.closedAt instanceof Date
          ? update.closedAt
          : new Date(update.closedAt),
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
    const sinceDate = new Date(opts.since);
    const query = db
      .select()
      .from(positions)
      .where(
        and(eq(positions.status, "closed"), gte(positions.closedAt, sinceDate)),
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
// Risk State Operations (typed, replaces bot_state KV)
// ---------------------------------------------------------------------------

/**
 * Get the current risk/circuit breaker state for an account.
 * Returns default state if no record exists.
 * @param accountId - Account ID (null for global state)
 */
export async function getRiskState(
  db: BotDatabase,
  accountId?: number | null,
): Promise<RiskState> {
  const condition =
    accountId != null
      ? eq(riskState.accountId, accountId)
      : isNull(riskState.accountId);

  const rows = await db.select().from(riskState).where(condition).limit(1);

  if (!rows[0]) return { ...DEFAULT_RISK_STATE, accountId: accountId ?? null };

  const row = rows[0];
  return {
    id: row.id,
    accountId: row.accountId,
    tripped: row.tripped,
    consecutiveLosses: row.consecutiveLosses,
    consecutiveErrors: row.consecutiveErrors,
    lastTrippedAt: row.lastTrippedAt,
    cooldownUntil: row.cooldownUntil,
    totalLossesToday: row.totalLossesToday,
    dailyPnl: row.dailyPnl,
    lastDailyResetDate: row.lastDailyResetDate,
    updatedAt: row.updatedAt,
  };
}

/**
 * Upsert risk state for an account.
 * Uses accountId unique constraint for conflict resolution.
 * @param accountId - Account ID (null for global state)
 */
export async function upsertRiskState(
  db: BotDatabase,
  state: Partial<RiskState>,
  accountId?: number | null,
): Promise<void> {
  const now = new Date();
  const acctId = accountId ?? state.accountId ?? null;

  const values = {
    accountId: acctId,
    tripped: state.tripped ?? false,
    consecutiveLosses: state.consecutiveLosses ?? 0,
    consecutiveErrors: state.consecutiveErrors ?? 0,
    lastTrippedAt: state.lastTrippedAt
      ? state.lastTrippedAt instanceof Date
        ? state.lastTrippedAt
        : new Date(state.lastTrippedAt)
      : null,
    cooldownUntil: state.cooldownUntil
      ? state.cooldownUntil instanceof Date
        ? state.cooldownUntil
        : new Date(state.cooldownUntil)
      : null,
    totalLossesToday: state.totalLossesToday ?? 0,
    dailyPnl: state.dailyPnl ?? 0,
    lastDailyResetDate: state.lastDailyResetDate ?? null,
    updatedAt: now,
  };

  if (acctId != null) {
    // Non-null accountId: use ON CONFLICT (unique constraint fires normally)
    await db
      .insert(riskState)
      .values(values)
      .onConflictDoUpdate({
        target: riskState.accountId,
        set: { ...values, updatedAt: now },
      });
  } else {
    // NULL accountId: Postgres UNIQUE treats NULLs as distinct, so
    // ON CONFLICT won't fire. Do a manual check-then-insert/update.
    const existing = await db
      .select({ id: riskState.id })
      .from(riskState)
      .where(isNull(riskState.accountId))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(riskState)
        .set({ ...values, updatedAt: now })
        .where(eq(riskState.id, existing[0].id));
    } else {
      await db.insert(riskState).values(values);
    }
  }
}

/**
 * Reset risk state for an account (or global) to defaults.
 * @param accountId - Account ID (null for global state)
 */
export async function resetRiskState(
  db: BotDatabase,
  accountId?: number | null,
): Promise<void> {
  await upsertRiskState(db, DEFAULT_RISK_STATE, accountId);
}

// Backward-compat aliases for circuit breaker (delegates to risk_state)
export async function getCircuitBreakerState(
  db: BotDatabase,
  accountId?: number,
): Promise<RiskState> {
  return getRiskState(db, accountId ?? null);
}

export async function setCircuitBreakerState(
  db: BotDatabase,
  state: RiskState,
  accountId?: number,
): Promise<void> {
  return upsertRiskState(db, state, accountId ?? null);
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
  const now = new Date();
  const result = await db
    .insert(strategies)
    .values({
      ...validated,
      createdAt: validated.createdAt
        ? new Date(String(validated.createdAt))
        : now,
      updatedAt: validated.updatedAt
        ? new Date(String(validated.updatedAt))
        : now,
    })
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
      updatedAt: new Date(),
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
// Account Operations (no credentials — shared from env)
// ---------------------------------------------------------------------------

/**
 * Insert a new account and return its ID.
 */
export async function insertAccount(
  db: BotDatabase,
  data: InsertAccount,
): Promise<number> {
  const validated = InsertAccountSchema.parse(data);
  const now = new Date();
  const result = await db
    .insert(accounts)
    .values({
      ...validated,
      createdAt: validated.createdAt
        ? new Date(String(validated.createdAt))
        : now,
      updatedAt: validated.updatedAt
        ? new Date(String(validated.updatedAt))
        : now,
    })
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
 * Update an account's fields (no credential fields).
 */
export async function updateAccount(
  db: BotDatabase,
  id: number,
  data: Partial<{
    name: string;
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
      updatedAt: new Date(),
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
// Instrument Operations (local market master data cache)
// ---------------------------------------------------------------------------

/**
 * Insert a new instrument record.
 */
export async function insertInstrument(
  db: BotDatabase,
  data: InsertInstrument,
): Promise<number> {
  const validated = InsertInstrumentSchema.parse(data);
  const result = await db
    .insert(instruments)
    .values({
      ...validated,
      lastSyncedAt: validated.lastSyncedAt
        ? new Date(String(validated.lastSyncedAt))
        : new Date(),
    })
    .returning({ id: instruments.id });
  return result[0].id;
}

/**
 * Get an instrument by its epic identifier.
 */
export async function getInstrument(
  db: BotDatabase,
  epic: string,
): Promise<InstrumentRow | null> {
  const rows = await db
    .select()
    .from(instruments)
    .where(eq(instruments.epic, epic))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Upsert an instrument (insert or update by epic).
 */
export async function upsertInstrument(
  db: BotDatabase,
  data: InsertInstrument,
): Promise<void> {
  const validated = InsertInstrumentSchema.parse(data);
  const now = new Date();
  await db
    .insert(instruments)
    .values({
      ...validated,
      lastSyncedAt: validated.lastSyncedAt
        ? new Date(String(validated.lastSyncedAt))
        : now,
    })
    .onConflictDoUpdate({
      target: instruments.epic,
      set: {
        name: validated.name,
        minDealSize: validated.minDealSize,
        tickSize: validated.tickSize,
        marginFactor: validated.marginFactor,
        currencyCode: validated.currencyCode,
        expiry: validated.expiry,
        tradingHours: validated.tradingHours,
        lastSyncedAt: now,
      },
    });
}

/**
 * Get instruments that haven't been synced since a given date.
 */
export async function getStaleInstruments(
  db: BotDatabase,
  olderThan: Date,
): Promise<InstrumentRow[]> {
  return db
    .select()
    .from(instruments)
    .where(lte(instruments.lastSyncedAt, olderThan));
}

// ---------------------------------------------------------------------------
// Account Snapshot Operations (equity curve)
// ---------------------------------------------------------------------------

/**
 * Insert a new account snapshot.
 */
export async function insertAccountSnapshot(
  db: BotDatabase,
  data: InsertAccountSnapshot,
): Promise<number> {
  const validated = InsertAccountSnapshotSchema.parse(data);
  const result = await db
    .insert(accountSnapshots)
    .values({
      ...validated,
      snapshotAt: validated.snapshotAt
        ? new Date(String(validated.snapshotAt))
        : new Date(),
    })
    .returning({ id: accountSnapshots.id });
  return result[0].id;
}

/**
 * Get recent account snapshots.
 */
export async function getRecentSnapshots(
  db: BotDatabase,
  accountId: number,
  limit = 100,
): Promise<AccountSnapshotRow[]> {
  return db
    .select()
    .from(accountSnapshots)
    .where(eq(accountSnapshots.accountId, accountId))
    .orderBy(desc(accountSnapshots.snapshotAt), desc(accountSnapshots.id))
    .limit(limit);
}

/**
 * Get snapshots within a date range for an account.
 */
export async function getSnapshotsInRange(
  db: BotDatabase,
  accountId: number,
  from: Date,
  to: Date,
): Promise<AccountSnapshotRow[]> {
  return db
    .select()
    .from(accountSnapshots)
    .where(
      and(
        eq(accountSnapshots.accountId, accountId),
        gte(accountSnapshots.snapshotAt, from),
        lte(accountSnapshots.snapshotAt, to),
      ),
    )
    .orderBy(desc(accountSnapshots.snapshotAt));
}

// ---------------------------------------------------------------------------
// Candle Operations (price data cache)
// ---------------------------------------------------------------------------

/**
 * Upsert candles (insert or ignore duplicates by epic+resolution+timestamp).
 */
export async function upsertCandles(
  db: BotDatabase,
  candleData: InsertCandle[],
): Promise<void> {
  if (candleData.length === 0) return;

  const validated = candleData.map((c) => InsertCandleSchema.parse(c));
  const values = validated.map((c) => ({
    ...c,
    timestamp:
      c.timestamp instanceof Date ? c.timestamp : new Date(c.timestamp),
  }));

  // Use onConflictDoUpdate on the unique constraint
  for (const v of values) {
    await db
      .insert(candles)
      .values(v)
      .onConflictDoUpdate({
        target: [candles.epic, candles.resolution, candles.timestamp],
        set: {
          open: v.open,
          high: v.high,
          low: v.low,
          close: v.close,
          volume: v.volume,
        },
      });
  }
}

/**
 * Get recent candles for an instrument + resolution.
 */
export async function getCandles(
  db: BotDatabase,
  epic: string,
  resolution: string,
  limit = 100,
): Promise<CandleRow[]> {
  return db
    .select()
    .from(candles)
    .where(and(eq(candles.epic, epic), eq(candles.resolution, resolution)))
    .orderBy(desc(candles.timestamp))
    .limit(limit);
}

/**
 * Get candles within a date range.
 */
export async function getCandleRange(
  db: BotDatabase,
  epic: string,
  resolution: string,
  from: Date,
  to: Date,
): Promise<CandleRow[]> {
  return db
    .select()
    .from(candles)
    .where(
      and(
        eq(candles.epic, epic),
        eq(candles.resolution, resolution),
        gte(candles.timestamp, from),
        lte(candles.timestamp, to),
      ),
    )
    .orderBy(desc(candles.timestamp));
}

/**
 * Prune candles older than a given date.
 */
export async function pruneOldCandles(
  db: BotDatabase,
  olderThan: Date,
): Promise<void> {
  await db.delete(candles).where(lte(candles.timestamp, olderThan));
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
  const sinceDate = new Date(since);

  const tickRows = await db
    .select()
    .from(ticks)
    .where(gte(ticks.startedAt, sinceDate));

  const signalRows = await db
    .select()
    .from(signals)
    .where(gte(signals.createdAt, sinceDate));

  const tradeRows = await db
    .select()
    .from(trades)
    .where(gte(trades.createdAt, sinceDate));

  return {
    totalTicks: tickRows.length,
    completedTicks: tickRows.filter((t) => t.status === "completed").length,
    errorTicks: tickRows.filter((t) => t.status === "error").length,
    skippedTicks: tickRows.filter((t) => t.status === "skipped").length,
    totalSignals: signalRows.length,
    totalTrades: tradeRows.length,
  };
}
