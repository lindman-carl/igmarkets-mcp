/**
 * Backtest State — CRUD operations for backtest persistence.
 *
 * Provides functions to insert and query:
 *   - backtestRuns   (one per execution)
 *   - backtestTrades (closed trades per run)
 *   - backtestEquity (bar-by-bar equity curve per run)
 *
 * All functions accept a BotDatabase instance so they work with both
 * the real PostgreSQL connection and the PGlite test database.
 */

import { eq, desc } from "drizzle-orm";
import type { BotDatabase } from "../../db/connection.js";
import { backtestRuns, backtestTrades, backtestEquity } from "./tables.js";
import {
  InsertBacktestRunSchema,
  InsertBacktestTradeSchema,
  InsertBacktestEquitySchema,
  type InsertBacktestRun,
  type InsertBacktestTrade,
  type InsertBacktestEquity,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Row types (inferred from Drizzle)
// ---------------------------------------------------------------------------

export type BacktestRunRow = typeof backtestRuns.$inferSelect;
export type BacktestTradeRow = typeof backtestTrades.$inferSelect;
export type BacktestEquityRow = typeof backtestEquity.$inferSelect;

// ---------------------------------------------------------------------------
// Backtest Run CRUD
// ---------------------------------------------------------------------------

/**
 * Insert a new backtest run record and return its generated ID.
 */
export async function insertBacktestRun(
  db: BotDatabase,
  data: InsertBacktestRun,
): Promise<number> {
  const validated = InsertBacktestRunSchema.parse(data);
  const result = await db
    .insert(backtestRuns)
    .values({
      strategyName: validated.strategyName,
      instruments: validated.instruments,
      startingCapital: validated.startingCapital,
      dateFrom: validated.dateFrom,
      dateTo: validated.dateTo,
      resolution: validated.resolution ?? "DAY",
      strategyParams: validated.strategyParams ?? null,
      riskConfig: validated.riskConfig ?? null,
      spreadPips: validated.spreadPips,
      slippagePips: validated.slippagePips,
      status: validated.status ?? "running",
      metrics: validated.metrics ?? null,
      warnings: validated.warnings ?? null,
      totalTrades: validated.totalTrades ?? null,
      totalBars: validated.totalBars ?? null,
      durationMs: validated.durationMs ?? null,
      startedAt: validated.startedAt,
      completedAt: validated.completedAt ?? null,
    })
    .returning({ id: backtestRuns.id });

  return result[0].id;
}

/**
 * Update an existing backtest run (e.g. to set status, metrics, completedAt).
 */
export async function updateBacktestRun(
  db: BotDatabase,
  runId: number,
  update: Partial<{
    status: "running" | "completed" | "error";
    metrics: unknown;
    warnings: string[];
    totalTrades: number;
    totalBars: number;
    durationMs: number;
    completedAt: Date;
  }>,
): Promise<void> {
  await db
    .update(backtestRuns)
    .set({
      ...(update.status !== undefined && { status: update.status }),
      ...(update.metrics !== undefined && { metrics: update.metrics }),
      ...(update.warnings !== undefined && { warnings: update.warnings }),
      ...(update.totalTrades !== undefined && {
        totalTrades: update.totalTrades,
      }),
      ...(update.totalBars !== undefined && { totalBars: update.totalBars }),
      ...(update.durationMs !== undefined && { durationMs: update.durationMs }),
      ...(update.completedAt !== undefined && {
        completedAt: update.completedAt,
      }),
    })
    .where(eq(backtestRuns.id, runId));
}

/**
 * Get a single backtest run by ID.
 */
export async function getBacktestRun(
  db: BotDatabase,
  runId: number,
): Promise<BacktestRunRow | null> {
  const rows = await db
    .select()
    .from(backtestRuns)
    .where(eq(backtestRuns.id, runId))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Get recent backtest runs, newest first.
 */
export async function getRecentBacktestRuns(
  db: BotDatabase,
  limit = 20,
): Promise<BacktestRunRow[]> {
  return db
    .select()
    .from(backtestRuns)
    .orderBy(desc(backtestRuns.startedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Backtest Trade CRUD
// ---------------------------------------------------------------------------

/**
 * Batch-insert simulated trades for a run.
 */
export async function insertBacktestTrades(
  db: BotDatabase,
  trades: InsertBacktestTrade[],
): Promise<void> {
  if (trades.length === 0) return;

  const validated = trades.map((t) => InsertBacktestTradeSchema.parse(t));
  await db.insert(backtestTrades).values(
    validated.map((v) => ({
      runId: v.runId,
      epic: v.epic,
      strategy: v.strategy,
      direction: v.direction,
      size: v.size,
      entryPrice: v.entryPrice,
      exitPrice: v.exitPrice,
      entryBar: v.entryBar,
      exitBar: v.exitBar,
      barsHeld: v.barsHeld,
      pnl: v.pnl,
      pnlPct: v.pnlPct,
      stopLevel: v.stopLevel ?? null,
      limitLevel: v.limitLevel ?? null,
      entrySignalData: v.entrySignalData ?? null,
      exitReason: v.exitReason,
      entryTimestamp: v.entryTimestamp ?? null,
      exitTimestamp: v.exitTimestamp ?? null,
    })),
  );
}

/**
 * Get all trades for a backtest run.
 */
export async function getBacktestTrades(
  db: BotDatabase,
  runId: number,
): Promise<BacktestTradeRow[]> {
  return db
    .select()
    .from(backtestTrades)
    .where(eq(backtestTrades.runId, runId))
    .orderBy(backtestTrades.entryBar);
}

// ---------------------------------------------------------------------------
// Backtest Equity CRUD
// ---------------------------------------------------------------------------

/**
 * Batch-insert equity curve points for a run.
 * Uses chunks of 500 to avoid large single inserts.
 */
export async function insertBacktestEquity(
  db: BotDatabase,
  points: InsertBacktestEquity[],
): Promise<void> {
  if (points.length === 0) return;

  const validated = points.map((p) => InsertBacktestEquitySchema.parse(p));
  const values = validated.map((v) => ({
    runId: v.runId,
    barIndex: v.barIndex,
    timestamp: v.timestamp ?? null,
    equity: v.equity,
    cash: v.cash,
    unrealizedPnl: v.unrealizedPnl,
    drawdownPct: v.drawdownPct,
    drawdownAmount: v.drawdownAmount,
    openPositionCount: v.openPositionCount,
  }));

  // Insert in chunks to avoid excessively large statements
  const CHUNK_SIZE = 500;
  for (let i = 0; i < values.length; i += CHUNK_SIZE) {
    await db.insert(backtestEquity).values(values.slice(i, i + CHUNK_SIZE));
  }
}

/**
 * Get the equity curve for a backtest run.
 */
export async function getBacktestEquity(
  db: BotDatabase,
  runId: number,
): Promise<BacktestEquityRow[]> {
  return db
    .select()
    .from(backtestEquity)
    .where(eq(backtestEquity.runId, runId))
    .orderBy(backtestEquity.barIndex);
}
