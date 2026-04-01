import { describe, it, expect, beforeEach } from "vitest";
import { createTestDb } from "../test/create-test-db.js";
import type { BotDatabase } from "../db/connection.js";
import {
  startTick,
  completeTick,
  getLastTick,
  getRecentTicks,
  insertSignal,
  markSignalActed,
  markSignalSkipped,
  getSignalsByTick,
  getRecentSignals,
  insertTrade,
  updateTradeConfirmation,
  getTradesByTick,
  getRecentTrades,
  insertPosition,
  getOpenPositions,
  getPositionByDealId,
  updatePositionLevels,
  closeTrackedPosition,
  getClosedPositions,
  getRiskState,
  upsertRiskState,
  resetRiskState,
  getCircuitBreakerState,
  setCircuitBreakerState,
  getTickSummary,
  insertStrategy,
  getStrategy,
  getStrategyByName,
  getActiveStrategies,
  updateStrategy,
  deleteStrategy,
  insertAccount,
  getAccount,
  getAccountByName,
  getActiveAccounts,
  updateAccount,
  deleteAccount,
  insertInstrument,
  getInstrument,
  upsertInstrument,
  getStaleInstruments,
  insertAccountSnapshot,
  getRecentSnapshots,
  getSnapshotsInRange,
  upsertCandles,
  getCandles,
  getCandleRange,
  pruneOldCandles,
} from "./state.js";
import {
  DEFAULT_CIRCUIT_BREAKER_STATE,
  DEFAULT_RISK_STATE,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();

// ---------------------------------------------------------------------------
// Tick operations
// ---------------------------------------------------------------------------

describe("startTick / completeTick / getLastTick", () => {
  let db: BotDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("startTick returns a numeric id", async () => {
    const id = await startTick(db, { startedAt: NOW, status: "running" });
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("completeTick updates status and stats", async () => {
    const id = await startTick(db, { startedAt: NOW, status: "running" });
    await completeTick(db, id, {
      status: "completed",
      completedAt: NOW,
      instrumentsScanned: 3,
      signalsGenerated: 1,
      tradesExecuted: 1,
    });
    const tick = await getLastTick(db);
    expect(tick).not.toBeNull();
    expect(tick!.status).toBe("completed");
    expect(tick!.instrumentsScanned).toBe(3);
    expect(tick!.signalsGenerated).toBe(1);
    expect(tick!.tradesExecuted).toBe(1);
  });

  it("getLastTick returns null when no completed ticks", async () => {
    const tick = await getLastTick(db);
    expect(tick).toBeNull();
  });

  it("getLastTick returns only completed ticks, not running", async () => {
    await startTick(db, { startedAt: NOW, status: "running" });
    const tick = await getLastTick(db);
    expect(tick).toBeNull();
  });

  it("getRecentTicks returns ticks in descending order", async () => {
    const id1 = await startTick(db, { startedAt: NOW, status: "running" });
    await completeTick(db, id1, { status: "completed", completedAt: NOW });
    const id2 = await startTick(db, { startedAt: NOW, status: "running" });
    await completeTick(db, id2, { status: "error", completedAt: NOW });

    const recent = await getRecentTicks(db, 10);
    expect(recent.length).toBe(2);
    expect(recent[0].id).toBe(id2); // most recent first
  });
});

// ---------------------------------------------------------------------------
// Signal operations
// ---------------------------------------------------------------------------

describe("insertSignal / getSignalsByTick / getRecentSignals", () => {
  let db: BotDatabase;
  let tickId: number;

  beforeEach(async () => {
    db = await createTestDb();
    tickId = await startTick(db, { startedAt: NOW, status: "running" });
  });

  it("insertSignal returns a numeric id", async () => {
    const id = await insertSignal(db, {
      tickId,
      epic: "IX.D.FTSE.DAILY.IP",
      strategy: "trend-following",
      action: "buy",
      signalType: "entry",
      confidence: 0.7,
      createdAt: NOW,
    });
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("getSignalsByTick returns signals for the right tick", async () => {
    await insertSignal(db, {
      tickId,
      epic: "IX.D.FTSE.DAILY.IP",
      strategy: "breakout",
      action: "sell",
      signalType: "entry",
      createdAt: NOW,
    });
    const signals = await getSignalsByTick(db, tickId);
    expect(signals).toHaveLength(1);
    expect(signals[0].epic).toBe("IX.D.FTSE.DAILY.IP");
    expect(signals[0].strategy).toBe("breakout");
  });

  it("getSignalsByTick returns empty for unknown tickId", async () => {
    expect(await getSignalsByTick(db, 999)).toHaveLength(0);
  });

  it("markSignalActed sets acted=true", async () => {
    const signalId = await insertSignal(db, {
      tickId,
      epic: "IX.D.FTSE.DAILY.IP",
      strategy: "mean-reversion",
      action: "buy",
      signalType: "entry",
      createdAt: NOW,
    });
    await markSignalActed(db, signalId);
    const signals = await getSignalsByTick(db, tickId);
    expect(signals[0].acted).toBe(true);
  });

  it("markSignalSkipped sets acted=false and skipReason", async () => {
    const signalId = await insertSignal(db, {
      tickId,
      epic: "IX.D.FTSE.DAILY.IP",
      strategy: "breakout",
      action: "buy",
      signalType: "entry",
      createdAt: NOW,
    });
    await markSignalSkipped(db, signalId, "circuit_breaker");
    const signals = await getSignalsByTick(db, tickId);
    expect(signals[0].acted).toBe(false);
    expect(signals[0].skipReason).toBe("circuit_breaker");
  });

  it("getRecentSignals filters by epic", async () => {
    await insertSignal(db, {
      tickId,
      epic: "EPIC_A",
      strategy: "trend-following",
      action: "buy",
      signalType: "entry",
      createdAt: NOW,
    });
    await insertSignal(db, {
      tickId,
      epic: "EPIC_B",
      strategy: "trend-following",
      action: "sell",
      signalType: "entry",
      createdAt: NOW,
    });
    const signals = await getRecentSignals(db, "EPIC_A");
    expect(signals).toHaveLength(1);
    expect(signals[0].epic).toBe("EPIC_A");
  });
});

// ---------------------------------------------------------------------------
// Trade operations
// ---------------------------------------------------------------------------

describe("insertTrade / updateTradeConfirmation / getTradesByTick", () => {
  let db: BotDatabase;
  let tickId: number;

  beforeEach(async () => {
    db = await createTestDb();
    tickId = await startTick(db, { startedAt: NOW, status: "running" });
  });

  it("insertTrade returns a numeric id", async () => {
    const id = await insertTrade(db, {
      tickId,
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "BUY",
      size: 1,
      orderType: "MARKET",
      status: "PENDING",
      currencyCode: "GBP",
      expiry: "DFB",
      createdAt: NOW,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("updateTradeConfirmation updates status and dealId", async () => {
    const tradeId = await insertTrade(db, {
      tickId,
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "BUY",
      size: 2,
      orderType: "MARKET",
      status: "PENDING",
      currencyCode: "GBP",
      expiry: "DFB",
      createdAt: NOW,
    });

    await updateTradeConfirmation(db, tradeId, {
      dealId: "DEAL123",
      executionPrice: 7500,
      status: "OPEN",
    });

    const trades = await getTradesByTick(db, tickId);
    expect(trades[0].status).toBe("OPEN");
    expect(trades[0].dealId).toBe("DEAL123");
    expect(trades[0].executionPrice).toBeCloseTo(7500);
  });

  it("getRecentTrades returns trades across ticks", async () => {
    await insertTrade(db, {
      tickId,
      epic: "EPIC_A",
      direction: "SELL",
      size: 1,
      orderType: "MARKET",
      status: "PENDING",
      currencyCode: "USD",
      expiry: "DFB",
      createdAt: NOW,
    });
    const trades = await getRecentTrades(db, 10);
    expect(trades).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Position operations
// ---------------------------------------------------------------------------

describe("insertPosition / getOpenPositions / closeTrackedPosition", () => {
  let db: BotDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  async function insertTestPosition(
    overrides: Partial<Parameters<typeof insertPosition>[1]> = {},
  ) {
    return insertPosition(db, {
      dealId: `DEAL_${Math.random().toString(36).slice(2)}`,
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "BUY",
      size: 1,
      entryPrice: 7500,
      currencyCode: "GBP",
      expiry: "DFB",
      openedAt: NOW,
      status: "open",
      ...overrides,
    } as Parameters<typeof insertPosition>[1]);
  }

  it("insertPosition returns a numeric id", async () => {
    const id = await insertTestPosition();
    expect(id).toBeGreaterThan(0);
  });

  it("getOpenPositions returns only open positions", async () => {
    await insertTestPosition({ dealId: "DEAL_OPEN", status: "open" });
    const tickId = await startTick(db, { startedAt: NOW, status: "running" });
    await insertTrade(db, {
      tickId,
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "SELL",
      size: 1,
      orderType: "MARKET",
      status: "PENDING",
      currencyCode: "GBP",
      expiry: "DFB",
      createdAt: NOW,
    });
    // Insert a closed position
    await insertTestPosition({ dealId: "DEAL_CLOSED" });
    await closeTrackedPosition(db, "DEAL_CLOSED", {
      exitPrice: 7600,
      realizedPnl: 100,
      closedAt: NOW,
    });

    const open = await getOpenPositions(db);
    expect(open.some((p) => p.dealId === "DEAL_OPEN")).toBe(true);
    expect(open.every((p) => p.status === "open")).toBe(true);
  });

  it("getPositionByDealId returns null for unknown deal", async () => {
    const pos = await getPositionByDealId(db, "UNKNOWN");
    expect(pos).toBeNull();
  });

  it("getPositionByDealId returns the correct position", async () => {
    await insertTestPosition({ dealId: "DEAL_KNOWN", entryPrice: 7800 });
    const pos = await getPositionByDealId(db, "DEAL_KNOWN");
    expect(pos).not.toBeNull();
    expect(pos!.entryPrice).toBeCloseTo(7800);
  });

  it("updatePositionLevels updates stop and limit", async () => {
    await insertTestPosition({ dealId: "DEAL_LEVELS" });
    await updatePositionLevels(db, "DEAL_LEVELS", {
      currentStop: 7400,
      currentLimit: 7700,
    });
    const pos = await getPositionByDealId(db, "DEAL_LEVELS");
    expect(pos!.currentStop).toBeCloseTo(7400);
    expect(pos!.currentLimit).toBeCloseTo(7700);
  });

  it("closeTrackedPosition marks position as closed with P&L", async () => {
    await insertTestPosition({ dealId: "DEAL_CLOSE" });
    await closeTrackedPosition(db, "DEAL_CLOSE", {
      exitPrice: 7600,
      realizedPnl: 100,
      closedAt: NOW,
    });
    const pos = await getPositionByDealId(db, "DEAL_CLOSE");
    expect(pos!.status).toBe("closed");
    expect(pos!.exitPrice).toBeCloseTo(7600);
    expect(pos!.realizedPnl).toBeCloseTo(100);
  });

  it("getClosedPositions returns only closed positions", async () => {
    await insertTestPosition({ dealId: "DEAL_OPEN2" });
    await insertTestPosition({ dealId: "DEAL_CLOSED2" });
    await closeTrackedPosition(db, "DEAL_CLOSED2", {
      exitPrice: 7500,
      realizedPnl: 0,
      closedAt: NOW,
    });
    const closed = await getClosedPositions(db);
    expect(closed.every((p) => p.status === "closed")).toBe(true);
    expect(closed.some((p) => p.dealId === "DEAL_CLOSED2")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Risk State (typed, replaces old bot_state KV)
// ---------------------------------------------------------------------------

describe("getRiskState / upsertRiskState / resetRiskState", () => {
  let db: BotDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns default state when no record exists", async () => {
    const state = await getRiskState(db);
    expect(state.tripped).toBe(false);
    expect(state.consecutiveLosses).toBe(0);
    expect(state.consecutiveErrors).toBe(0);
    expect(state.dailyPnl).toBe(0);
    expect(state.totalLossesToday).toBe(0);
  });

  it("upserts and retrieves risk state", async () => {
    await upsertRiskState(db, {
      tripped: true,
      consecutiveLosses: 3,
      dailyPnl: -500,
      lastTrippedAt: new Date().toISOString(),
      cooldownUntil: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const state = await getRiskState(db);
    expect(state.tripped).toBe(true);
    expect(state.consecutiveLosses).toBe(3);
    expect(state.dailyPnl).toBeCloseTo(-500);
  });

  it("upserts (overwrites) existing risk state", async () => {
    await upsertRiskState(db, { consecutiveLosses: 1 });
    await upsertRiskState(db, { consecutiveLosses: 5 });
    const state = await getRiskState(db);
    expect(state.consecutiveLosses).toBe(5);
  });

  it("resetRiskState returns to defaults", async () => {
    await upsertRiskState(db, { tripped: true, consecutiveLosses: 10 });
    await resetRiskState(db);
    const state = await getRiskState(db);
    expect(state.tripped).toBe(false);
    expect(state.consecutiveLosses).toBe(0);
  });

  it("stores and retrieves lastDailyResetDate", async () => {
    const today = "2026-04-01";
    await upsertRiskState(db, { lastDailyResetDate: today });
    const state = await getRiskState(db);
    expect(state.lastDailyResetDate).toBe(today);
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker backward-compat aliases
// ---------------------------------------------------------------------------

describe("getCircuitBreakerState / setCircuitBreakerState (backward-compat)", () => {
  let db: BotDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns default state when not set", async () => {
    const state = await getCircuitBreakerState(db);
    expect(state.tripped).toBe(false);
    expect(state.consecutiveLosses).toBe(0);
    expect(state.consecutiveErrors).toBe(0);
    expect(state.dailyPnl).toBe(0);
  });

  it("persists and retrieves circuit breaker state", async () => {
    const modified = {
      ...DEFAULT_CIRCUIT_BREAKER_STATE,
      consecutiveLosses: 2,
      dailyPnl: -100,
    };
    await setCircuitBreakerState(db, modified);
    const state = await getCircuitBreakerState(db);
    expect(state.consecutiveLosses).toBe(2);
    expect(state.dailyPnl).toBeCloseTo(-100);
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker per-account scoping
// ---------------------------------------------------------------------------

describe("circuit breaker per-account scoping", () => {
  let db: BotDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("global and per-account circuit breaker states are independent", async () => {
    const global = { ...DEFAULT_CIRCUIT_BREAKER_STATE, consecutiveLosses: 1 };
    const account1 = { ...DEFAULT_CIRCUIT_BREAKER_STATE, consecutiveLosses: 2 };
    const account2 = { ...DEFAULT_CIRCUIT_BREAKER_STATE, consecutiveLosses: 3 };

    await setCircuitBreakerState(db, global);
    await setCircuitBreakerState(db, account1, 1);
    await setCircuitBreakerState(db, account2, 2);

    expect((await getCircuitBreakerState(db)).consecutiveLosses).toBe(1);
    expect((await getCircuitBreakerState(db, 1)).consecutiveLosses).toBe(2);
    expect((await getCircuitBreakerState(db, 2)).consecutiveLosses).toBe(3);
  });

  it("returns default for uninitialized per-account state", async () => {
    const state = await getCircuitBreakerState(db, 42);
    expect(state.tripped).toBe(false);
    expect(state.consecutiveLosses).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// getTickSummary
// ---------------------------------------------------------------------------

describe("getTickSummary", () => {
  let db: BotDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns zeroes for empty database", async () => {
    const summary = await getTickSummary(db, "2000-01-01T00:00:00.000Z");
    expect(summary.totalTicks).toBe(0);
    expect(summary.completedTicks).toBe(0);
    expect(summary.totalSignals).toBe(0);
    expect(summary.totalTrades).toBe(0);
  });

  it("counts ticks by status correctly", async () => {
    const t1 = await startTick(db, { startedAt: NOW, status: "running" });
    await completeTick(db, t1, { status: "completed", completedAt: NOW });
    const t2 = await startTick(db, { startedAt: NOW, status: "running" });
    await completeTick(db, t2, { status: "error", completedAt: NOW });
    const t3 = await startTick(db, { startedAt: NOW, status: "running" });
    await completeTick(db, t3, { status: "skipped", completedAt: NOW });

    const summary = await getTickSummary(db, "2000-01-01T00:00:00.000Z");
    expect(summary.totalTicks).toBe(3);
    expect(summary.completedTicks).toBe(1);
    expect(summary.errorTicks).toBe(1);
    expect(summary.skippedTicks).toBe(1);
  });

  it("counts signals and trades", async () => {
    const tickId = await startTick(db, { startedAt: NOW, status: "running" });
    await insertSignal(db, {
      tickId,
      epic: "EPIC",
      strategy: "breakout",
      action: "buy",
      signalType: "entry",
      createdAt: NOW,
    });
    await insertTrade(db, {
      tickId,
      epic: "EPIC",
      direction: "BUY",
      size: 1,
      orderType: "MARKET",
      status: "OPEN",
      currencyCode: "GBP",
      expiry: "DFB",
      createdAt: NOW,
    });

    const summary = await getTickSummary(db, "2000-01-01T00:00:00.000Z");
    expect(summary.totalSignals).toBe(1);
    expect(summary.totalTrades).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Strategy CRUD operations
// ---------------------------------------------------------------------------

describe("strategy CRUD", () => {
  let db: BotDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  const STRATEGY_DATA = {
    name: "FTSE Trend Follower",
    prompt: "---\nstrategyType: trend-following\n---\n\nBuy on SMA crossover.",
    strategyType: "trend-following",
    createdAt: NOW,
    updatedAt: NOW,
  };

  it("insertStrategy returns a numeric id", async () => {
    const id = await insertStrategy(db, STRATEGY_DATA);
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("getStrategy retrieves a strategy by ID", async () => {
    const id = await insertStrategy(db, STRATEGY_DATA);
    const row = await getStrategy(db, id);
    expect(row).not.toBeNull();
    expect(row!.name).toBe("FTSE Trend Follower");
    expect(row!.strategyType).toBe("trend-following");
    expect(row!.prompt).toContain("Buy on SMA crossover");
    expect(row!.isActive).toBe(true);
  });

  it("getStrategy returns null for unknown ID", async () => {
    const row = await getStrategy(db, 999);
    expect(row).toBeNull();
  });

  it("getStrategyByName retrieves a strategy by name", async () => {
    await insertStrategy(db, STRATEGY_DATA);
    const row = await getStrategyByName(db, "FTSE Trend Follower");
    expect(row).not.toBeNull();
    expect(row!.strategyType).toBe("trend-following");
  });

  it("getStrategyByName returns null for unknown name", async () => {
    const row = await getStrategyByName(db, "nonexistent");
    expect(row).toBeNull();
  });

  it("getActiveStrategies returns only active strategies", async () => {
    await insertStrategy(db, STRATEGY_DATA);
    await insertStrategy(db, {
      ...STRATEGY_DATA,
      name: "Inactive Strategy",
      isActive: false,
    });

    const active = await getActiveStrategies(db);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("FTSE Trend Follower");
  });

  it("updateStrategy modifies fields and sets updatedAt", async () => {
    const id = await insertStrategy(db, STRATEGY_DATA);
    const before = await getStrategy(db, id);
    await updateStrategy(db, id, {
      name: "Renamed Strategy",
      strategyType: "breakout",
    });

    const row = await getStrategy(db, id);
    expect(row!.name).toBe("Renamed Strategy");
    expect(row!.strategyType).toBe("breakout");
    // updatedAt should be newer
    expect(row!.updatedAt.getTime()).toBeGreaterThanOrEqual(
      before!.updatedAt.getTime(),
    );
  });

  it("updateStrategy can deactivate a strategy", async () => {
    const id = await insertStrategy(db, STRATEGY_DATA);
    await updateStrategy(db, id, { isActive: false });

    const row = await getStrategy(db, id);
    expect(row!.isActive).toBe(false);

    const active = await getActiveStrategies(db);
    expect(active).toHaveLength(0);
  });

  it("deleteStrategy removes the strategy", async () => {
    const id = await insertStrategy(db, STRATEGY_DATA);
    await deleteStrategy(db, id);

    const row = await getStrategy(db, id);
    expect(row).toBeNull();
  });

  it("enforces unique name constraint", async () => {
    await insertStrategy(db, STRATEGY_DATA);
    await expect(insertStrategy(db, STRATEGY_DATA)).rejects.toThrow();
  });

  it("stores and retrieves JSON strategyParams", async () => {
    const id = await insertStrategy(db, {
      ...STRATEGY_DATA,
      name: "With Params",
      strategyParams: { smaPeriodFast: 5, smaPeriodSlow: 20 },
    });

    const row = await getStrategy(db, id);
    expect(row!.strategyParams).toEqual({
      smaPeriodFast: 5,
      smaPeriodSlow: 20,
    });
  });

  it("stores and retrieves JSON riskConfig", async () => {
    const id = await insertStrategy(db, {
      ...STRATEGY_DATA,
      name: "With Risk",
      riskConfig: { maxRiskPerTradePct: 0.02, maxOpenPositions: 3 },
    });

    const row = await getStrategy(db, id);
    expect(row!.riskConfig).toEqual({
      maxRiskPerTradePct: 0.02,
      maxOpenPositions: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// Account CRUD operations (no credentials)
// ---------------------------------------------------------------------------

describe("account CRUD", () => {
  let db: BotDatabase;
  let strategyId: number;

  beforeEach(async () => {
    db = await createTestDb();
    strategyId = await insertStrategy(db, {
      name: "Test Strategy",
      prompt: "---\nstrategyType: breakout\n---\n\nTest.",
      strategyType: "breakout",
      createdAt: NOW,
      updatedAt: NOW,
    });
  });

  function accountData(overrides: Record<string, unknown> = {}) {
    return {
      name: "UK Indices Demo",
      isDemo: true,
      strategyId,
      createdAt: NOW,
      updatedAt: NOW,
      ...overrides,
    };
  }

  it("insertAccount returns a numeric id", async () => {
    const id = await insertAccount(db, accountData());
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("getAccount retrieves an account by ID", async () => {
    const id = await insertAccount(db, accountData());
    const row = await getAccount(db, id);
    expect(row).not.toBeNull();
    expect(row!.name).toBe("UK Indices Demo");
    expect(row!.isDemo).toBe(true);
    expect(row!.strategyId).toBe(strategyId);
    expect(row!.intervalMinutes).toBe(15);
    expect(row!.timezone).toBe("Europe/London");
    expect(row!.isActive).toBe(true);
  });

  it("getAccount returns null for unknown ID", async () => {
    const row = await getAccount(db, 999);
    expect(row).toBeNull();
  });

  it("getAccountByName retrieves an account by name", async () => {
    await insertAccount(db, accountData());
    const row = await getAccountByName(db, "UK Indices Demo");
    expect(row).not.toBeNull();
    expect(row!.isDemo).toBe(true);
  });

  it("getAccountByName returns null for unknown name", async () => {
    const row = await getAccountByName(db, "nonexistent");
    expect(row).toBeNull();
  });

  it("getActiveAccounts returns only active accounts", async () => {
    await insertAccount(db, accountData());
    await insertAccount(
      db,
      accountData({
        name: "Inactive Account",
        isActive: false,
      }),
    );

    const active = await getActiveAccounts(db);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("UK Indices Demo");
  });

  it("updateAccount modifies fields and sets updatedAt", async () => {
    const id = await insertAccount(db, accountData());
    const before = await getAccount(db, id);
    await updateAccount(db, id, {
      name: "Renamed Account",
      intervalMinutes: 60,
    });

    const row = await getAccount(db, id);
    expect(row!.name).toBe("Renamed Account");
    expect(row!.intervalMinutes).toBe(60);
    expect(row!.updatedAt.getTime()).toBeGreaterThanOrEqual(
      before!.updatedAt.getTime(),
    );
  });

  it("updateAccount can deactivate an account", async () => {
    const id = await insertAccount(db, accountData());
    await updateAccount(db, id, { isActive: false });

    const row = await getAccount(db, id);
    expect(row!.isActive).toBe(false);

    const active = await getActiveAccounts(db);
    expect(active).toHaveLength(0);
  });

  it("updateAccount can change strategy", async () => {
    const newStrategyId = await insertStrategy(db, {
      name: "New Strategy",
      prompt: "---\nstrategyType: mean-reversion\n---\n",
      strategyType: "mean-reversion",
      createdAt: NOW,
      updatedAt: NOW,
    });

    const id = await insertAccount(db, accountData());
    await updateAccount(db, id, { strategyId: newStrategyId });

    const row = await getAccount(db, id);
    expect(row!.strategyId).toBe(newStrategyId);
  });

  it("deleteAccount removes the account", async () => {
    const id = await insertAccount(db, accountData());
    await deleteAccount(db, id);

    const row = await getAccount(db, id);
    expect(row).toBeNull();
  });

  it("enforces unique name constraint", async () => {
    await insertAccount(db, accountData());
    await expect(insertAccount(db, accountData())).rejects.toThrow();
  });

  it("stores custom interval and timezone", async () => {
    const id = await insertAccount(
      db,
      accountData({
        name: "US Account",
        intervalMinutes: 5,
        timezone: "America/New_York",
        isDemo: false,
      }),
    );

    const row = await getAccount(db, id);
    expect(row!.intervalMinutes).toBe(5);
    expect(row!.timezone).toBe("America/New_York");
    expect(row!.isDemo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getOpenPositions with accountId filter
// ---------------------------------------------------------------------------

describe("getOpenPositions with accountId filter", () => {
  let db: BotDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("filters positions by accountId", async () => {
    await insertPosition(db, {
      dealId: "DEAL_A1",
      epic: "EPIC_A",
      direction: "BUY",
      size: 1,
      entryPrice: 100,
      currencyCode: "GBP",
      expiry: "DFB",
      openedAt: NOW,
      status: "open",
    });

    await insertPosition(db, {
      dealId: "DEAL_A2",
      epic: "EPIC_B",
      direction: "SELL",
      size: 2,
      entryPrice: 200,
      currencyCode: "USD",
      expiry: "DFB",
      openedAt: NOW,
      status: "open",
    });

    // Without filter — returns all open
    const all = await getOpenPositions(db);
    expect(all).toHaveLength(2);

    // With accountId filter — since we didn't set accountId, filtering by 1 returns none
    const filtered = await getOpenPositions(db, 1);
    expect(filtered).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Instrument CRUD operations
// ---------------------------------------------------------------------------

describe("instrument CRUD", () => {
  let db: BotDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  const INSTRUMENT_DATA = {
    epic: "IX.D.FTSE.DAILY.IP",
    name: "FTSE 100 DFB",
    minDealSize: 0.5,
    tickSize: 1.0,
    marginFactor: 0.05,
    currencyCode: "GBP",
    expiry: "DFB",
  };

  it("insertInstrument returns a numeric id", async () => {
    const id = await insertInstrument(db, INSTRUMENT_DATA);
    expect(typeof id).toBe("number");
    expect(id).toBeGreaterThan(0);
  });

  it("getInstrument retrieves by epic", async () => {
    await insertInstrument(db, INSTRUMENT_DATA);
    const row = await getInstrument(db, "IX.D.FTSE.DAILY.IP");
    expect(row).not.toBeNull();
    expect(row!.name).toBe("FTSE 100 DFB");
    expect(row!.minDealSize).toBeCloseTo(0.5);
    expect(row!.currencyCode).toBe("GBP");
  });

  it("getInstrument returns null for unknown epic", async () => {
    const row = await getInstrument(db, "UNKNOWN");
    expect(row).toBeNull();
  });

  it("upsertInstrument updates existing instrument", async () => {
    await insertInstrument(db, INSTRUMENT_DATA);
    await upsertInstrument(db, {
      ...INSTRUMENT_DATA,
      name: "FTSE 100 Updated",
      minDealSize: 1.0,
    });

    const row = await getInstrument(db, "IX.D.FTSE.DAILY.IP");
    expect(row!.name).toBe("FTSE 100 Updated");
    expect(row!.minDealSize).toBeCloseTo(1.0);
  });

  it("upsertInstrument inserts new instrument", async () => {
    await upsertInstrument(db, {
      epic: "CS.D.AAPL.CFD.IP",
      name: "Apple CFD",
      minDealSize: 1,
      currencyCode: "USD",
    });

    const row = await getInstrument(db, "CS.D.AAPL.CFD.IP");
    expect(row).not.toBeNull();
    expect(row!.name).toBe("Apple CFD");
  });

  it("getStaleInstruments returns instruments older than threshold", async () => {
    await insertInstrument(db, INSTRUMENT_DATA);
    // The default lastSyncedAt is now(), so querying for "older than tomorrow" should return it
    const tomorrow = new Date(Date.now() + 86_400_000);
    const stale = await getStaleInstruments(db, tomorrow);
    expect(stale).toHaveLength(1);

    // Querying for "older than yesterday" should return none
    const yesterday = new Date(Date.now() - 86_400_000);
    const fresh = await getStaleInstruments(db, yesterday);
    expect(fresh).toHaveLength(0);
  });

  it("enforces unique epic constraint", async () => {
    await insertInstrument(db, INSTRUMENT_DATA);
    await expect(insertInstrument(db, INSTRUMENT_DATA)).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Account Snapshot operations
// ---------------------------------------------------------------------------

describe("account snapshot CRUD", () => {
  let db: BotDatabase;
  let accountId: number;

  beforeEach(async () => {
    db = await createTestDb();
    const strategyId = await insertStrategy(db, {
      name: "Test",
      prompt: "test",
      strategyType: "breakout",
    });
    accountId = await insertAccount(db, {
      name: "Test Account",
      strategyId,
    });
  });

  it("insertAccountSnapshot returns a numeric id", async () => {
    const id = await insertAccountSnapshot(db, {
      accountId,
      balance: 10000,
      equity: 10500,
      margin: 500,
      profitLoss: 500,
      availableFunds: 10000,
    });
    expect(id).toBeGreaterThan(0);
  });

  it("getRecentSnapshots returns snapshots in descending order", async () => {
    await insertAccountSnapshot(db, {
      accountId,
      balance: 10000,
      equity: 10000,
      margin: 0,
      profitLoss: 0,
      availableFunds: 10000,
    });
    await insertAccountSnapshot(db, {
      accountId,
      balance: 10500,
      equity: 10500,
      margin: 0,
      profitLoss: 500,
      availableFunds: 10500,
    });

    const snapshots = await getRecentSnapshots(db, accountId, 10);
    expect(snapshots).toHaveLength(2);
    // Most recent first
    expect(snapshots[0].balance).toBeCloseTo(10500);
  });

  it("getSnapshotsInRange filters by date", async () => {
    await insertAccountSnapshot(db, {
      accountId,
      balance: 10000,
      equity: 10000,
      margin: 0,
      profitLoss: 0,
      availableFunds: 10000,
    });

    const from = new Date(Date.now() - 86_400_000);
    const to = new Date(Date.now() + 86_400_000);
    const inRange = await getSnapshotsInRange(db, accountId, from, to);
    expect(inRange).toHaveLength(1);

    // Range in the past
    const pastFrom = new Date("2020-01-01");
    const pastTo = new Date("2020-12-31");
    const outOfRange = await getSnapshotsInRange(
      db,
      accountId,
      pastFrom,
      pastTo,
    );
    expect(outOfRange).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Candle operations
// ---------------------------------------------------------------------------

describe("candle CRUD", () => {
  let db: BotDatabase;
  beforeEach(async () => {
    db = await createTestDb();
  });

  it("upsertCandles inserts new candles", async () => {
    const now = new Date();
    await upsertCandles(db, [
      {
        epic: "IX.D.FTSE.DAILY.IP",
        resolution: "DAY",
        timestamp: now.toISOString(),
        open: 7500,
        high: 7550,
        low: 7450,
        close: 7520,
      },
    ]);

    const rows = await getCandles(db, "IX.D.FTSE.DAILY.IP", "DAY", 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].open).toBeCloseTo(7500);
    expect(rows[0].close).toBeCloseTo(7520);
  });

  it("upsertCandles updates existing candles on conflict", async () => {
    const ts = new Date("2026-04-01T12:00:00Z").toISOString();
    await upsertCandles(db, [
      {
        epic: "EPIC_A",
        resolution: "HOUR",
        timestamp: ts,
        open: 100,
        high: 110,
        low: 90,
        close: 105,
      },
    ]);

    // Upsert with updated close price
    await upsertCandles(db, [
      {
        epic: "EPIC_A",
        resolution: "HOUR",
        timestamp: ts,
        open: 100,
        high: 115,
        low: 88,
        close: 112,
      },
    ]);

    const rows = await getCandles(db, "EPIC_A", "HOUR", 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].close).toBeCloseTo(112);
    expect(rows[0].high).toBeCloseTo(115);
  });

  it("upsertCandles handles empty array gracefully", async () => {
    await upsertCandles(db, []);
    const rows = await getCandles(db, "EPIC", "DAY", 10);
    expect(rows).toHaveLength(0);
  });

  it("getCandleRange filters by date range", async () => {
    const t1 = new Date("2026-04-01T10:00:00Z");
    const t2 = new Date("2026-04-01T11:00:00Z");
    const t3 = new Date("2026-04-01T12:00:00Z");

    await upsertCandles(db, [
      {
        epic: "E",
        resolution: "HOUR",
        timestamp: t1.toISOString(),
        open: 1,
        high: 2,
        low: 0,
        close: 1.5,
      },
      {
        epic: "E",
        resolution: "HOUR",
        timestamp: t2.toISOString(),
        open: 2,
        high: 3,
        low: 1,
        close: 2.5,
      },
      {
        epic: "E",
        resolution: "HOUR",
        timestamp: t3.toISOString(),
        open: 3,
        high: 4,
        low: 2,
        close: 3.5,
      },
    ]);

    const range = await getCandleRange(db, "E", "HOUR", t1, t2);
    expect(range).toHaveLength(2);
  });

  it("pruneOldCandles removes candles older than threshold", async () => {
    const old = new Date("2020-01-01T00:00:00Z");
    const recent = new Date();

    await upsertCandles(db, [
      {
        epic: "E",
        resolution: "DAY",
        timestamp: old.toISOString(),
        open: 1,
        high: 2,
        low: 0,
        close: 1,
      },
      {
        epic: "E",
        resolution: "DAY",
        timestamp: recent.toISOString(),
        open: 2,
        high: 3,
        low: 1,
        close: 2,
      },
    ]);

    await pruneOldCandles(db, new Date("2025-01-01T00:00:00Z"));

    const rows = await getCandles(db, "E", "DAY", 10);
    expect(rows).toHaveLength(1);
    expect(rows[0].close).toBeCloseTo(2);
  });
});
