import { describe, it, expect, beforeEach } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
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
  getState,
  setState,
  deleteState,
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
} from "./state.js";
import { DEFAULT_CIRCUIT_BREAKER_STATE } from "./schemas.js";

// ---------------------------------------------------------------------------
// In-memory test database
// ---------------------------------------------------------------------------

/**
 * Create a fresh in-memory SQLite database with all tables applied.
 * Each test gets its own isolated instance.
 */
function createTestDb(): BotDatabase {
  const sqlite = new Database(":memory:");

  // Apply schema manually (same DDL as the migration file)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS strategies (
      id             INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name           TEXT NOT NULL UNIQUE,
      prompt         TEXT NOT NULL,
      strategy_type  TEXT NOT NULL,
      strategy_params TEXT,
      risk_config    TEXT,
      is_active      INTEGER DEFAULT true NOT NULL,
      created_at     TEXT NOT NULL,
      updated_at     TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id               INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      name             TEXT NOT NULL UNIQUE,
      ig_api_key       TEXT NOT NULL,
      ig_username      TEXT NOT NULL,
      ig_password      TEXT NOT NULL,
      is_demo          INTEGER DEFAULT true NOT NULL,
      strategy_id      INTEGER NOT NULL,
      interval_minutes INTEGER DEFAULT 15 NOT NULL,
      timezone         TEXT DEFAULT 'Europe/London' NOT NULL,
      is_active        INTEGER DEFAULT true NOT NULL,
      created_at       TEXT NOT NULL,
      updated_at       TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS bot_state (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS positions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      account_id    INTEGER,
      deal_id       TEXT NOT NULL UNIQUE,
      epic          TEXT NOT NULL,
      direction     TEXT NOT NULL,
      size          REAL NOT NULL,
      entry_price   REAL NOT NULL,
      current_stop  REAL,
      current_limit REAL,
      strategy      TEXT,
      status        TEXT DEFAULT 'open' NOT NULL,
      exit_price    REAL,
      realized_pnl  REAL,
      currency_code TEXT NOT NULL,
      expiry        TEXT NOT NULL,
      opened_at     TEXT NOT NULL,
      closed_at     TEXT,
      open_trade_id  INTEGER,
      close_trade_id INTEGER,
      metadata      TEXT
    );
    CREATE TABLE IF NOT EXISTS signals (
      id              INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      account_id      INTEGER,
      tick_id         INTEGER NOT NULL,
      epic            TEXT NOT NULL,
      strategy        TEXT NOT NULL,
      action          TEXT NOT NULL,
      signal_type     TEXT NOT NULL,
      confidence      REAL,
      price_at_signal REAL,
      suggested_stop  REAL,
      suggested_limit REAL,
      suggested_size  REAL,
      acted           INTEGER DEFAULT false,
      skip_reason     TEXT,
      created_at      TEXT NOT NULL,
      indicator_data  TEXT
    );
    CREATE TABLE IF NOT EXISTS ticks (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      account_id          INTEGER,
      started_at          TEXT NOT NULL,
      completed_at        TEXT,
      status              TEXT DEFAULT 'running' NOT NULL,
      instruments_scanned INTEGER DEFAULT 0,
      signals_generated   INTEGER DEFAULT 0,
      trades_executed     INTEGER DEFAULT 0,
      error               TEXT,
      metadata            TEXT
    );
    CREATE TABLE IF NOT EXISTS trades (
      id               INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      account_id       INTEGER,
      tick_id          INTEGER NOT NULL,
      signal_id        INTEGER,
      deal_reference   TEXT,
      deal_id          TEXT,
      epic             TEXT NOT NULL,
      direction        TEXT NOT NULL,
      size             REAL NOT NULL,
      order_type       TEXT NOT NULL,
      execution_price  REAL,
      stop_level       REAL,
      limit_level      REAL,
      status           TEXT DEFAULT 'PENDING' NOT NULL,
      reject_reason    TEXT,
      currency_code    TEXT NOT NULL,
      expiry           TEXT NOT NULL,
      created_at       TEXT NOT NULL,
      confirmation_data TEXT
    );
  `);

  return drizzle({ client: sqlite, schema }) as unknown as BotDatabase;
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const NOW = new Date().toISOString();
const TODAY = NOW.split("T")[0]; // "YYYY-MM-DD"

// ---------------------------------------------------------------------------
// Tick operations
// ---------------------------------------------------------------------------

describe("startTick / completeTick / getLastTick", () => {
  let db: BotDatabase;
  beforeEach(() => {
    db = createTestDb();
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
    await startTick(db, { startedAt: NOW, status: "running" }); // running tick — should be ignored
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
    db = createTestDb();
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
    db = createTestDb();
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

  beforeEach(() => {
    db = createTestDb();
  });

  async function insertTestPosition(overrides: Partial<Parameters<typeof insertPosition>[1]> = {}) {
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
    const closedId = await insertTestPosition({ dealId: "DEAL_CLOSED" });
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
// Key-value state store
// ---------------------------------------------------------------------------

describe("getState / setState / deleteState", () => {
  let db: BotDatabase;
  beforeEach(() => {
    db = createTestDb();
  });

  it("returns null for missing key", async () => {
    expect(await getState(db, "nonexistent")).toBeNull();
  });

  it("sets and retrieves a value", async () => {
    await setState(db, "foo", { bar: 42 });
    const val = await getState<{ bar: number }>(db, "foo");
    expect(val).toEqual({ bar: 42 });
  });

  it("upserts (overwrites) existing value", async () => {
    await setState(db, "key", "first");
    await setState(db, "key", "second");
    expect(await getState(db, "key")).toBe("second");
  });

  it("deleteState removes the key", async () => {
    await setState(db, "to_delete", 123);
    await deleteState(db, "to_delete");
    expect(await getState(db, "to_delete")).toBeNull();
  });

  it("supports primitive and complex values", async () => {
    await setState(db, "num", 99);
    await setState(db, "arr", [1, 2, 3]);
    expect(await getState(db, "num")).toBe(99);
    expect(await getState(db, "arr")).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker state convenience wrappers
// ---------------------------------------------------------------------------

describe("getCircuitBreakerState / setCircuitBreakerState", () => {
  let db: BotDatabase;
  beforeEach(() => {
    db = createTestDb();
  });

  it("returns default state when not set", async () => {
    const state = await getCircuitBreakerState(db);
    expect(state).toEqual(DEFAULT_CIRCUIT_BREAKER_STATE);
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

  it("returns default when stored value is invalid JSON shape", async () => {
    await setState(db, "circuit_breaker", { invalid: true });
    const state = await getCircuitBreakerState(db);
    expect(state).toEqual(DEFAULT_CIRCUIT_BREAKER_STATE);
  });
});

// ---------------------------------------------------------------------------
// getTickSummary
// ---------------------------------------------------------------------------

describe("getTickSummary", () => {
  let db: BotDatabase;
  beforeEach(() => {
    db = createTestDb();
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
  beforeEach(() => {
    db = createTestDb();
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
    await updateStrategy(db, id, {
      name: "Renamed Strategy",
      strategyType: "breakout",
    });

    const row = await getStrategy(db, id);
    expect(row!.name).toBe("Renamed Strategy");
    expect(row!.strategyType).toBe("breakout");
    // updatedAt should have changed
    expect(row!.updatedAt).not.toBe(NOW);
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
    expect(row!.strategyParams).toEqual({ smaPeriodFast: 5, smaPeriodSlow: 20 });
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
// Account CRUD operations
// ---------------------------------------------------------------------------

describe("account CRUD", () => {
  let db: BotDatabase;
  let strategyId: number;

  beforeEach(async () => {
    db = createTestDb();
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
      igApiKey: "test-api-key",
      igUsername: "test-user",
      igPassword: "test-pass",
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
    expect(row!.igApiKey).toBe("test-api-key");
    expect(row!.igUsername).toBe("test-user");
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
    expect(row!.igUsername).toBe("test-user");
  });

  it("getAccountByName returns null for unknown name", async () => {
    const row = await getAccountByName(db, "nonexistent");
    expect(row).toBeNull();
  });

  it("getActiveAccounts returns only active accounts", async () => {
    await insertAccount(db, accountData());
    await insertAccount(db, accountData({
      name: "Inactive Account",
      isActive: false,
    }));

    const active = await getActiveAccounts(db);
    expect(active).toHaveLength(1);
    expect(active[0].name).toBe("UK Indices Demo");
  });

  it("updateAccount modifies fields and sets updatedAt", async () => {
    const id = await insertAccount(db, accountData());
    await updateAccount(db, id, {
      name: "Renamed Account",
      intervalMinutes: 60,
    });

    const row = await getAccount(db, id);
    expect(row!.name).toBe("Renamed Account");
    expect(row!.intervalMinutes).toBe(60);
    expect(row!.updatedAt).not.toBe(NOW);
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
    const id = await insertAccount(db, accountData({
      name: "US Account",
      intervalMinutes: 5,
      timezone: "America/New_York",
      isDemo: false,
    }));

    const row = await getAccount(db, id);
    expect(row!.intervalMinutes).toBe(5);
    expect(row!.timezone).toBe("America/New_York");
    expect(row!.isDemo).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Circuit breaker per-account scoping
// ---------------------------------------------------------------------------

describe("circuit breaker per-account scoping", () => {
  let db: BotDatabase;
  beforeEach(() => {
    db = createTestDb();
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
    expect(state).toEqual(DEFAULT_CIRCUIT_BREAKER_STATE);
  });
});

// ---------------------------------------------------------------------------
// getOpenPositions with accountId filter
// ---------------------------------------------------------------------------

describe("getOpenPositions with accountId filter", () => {
  let db: BotDatabase;
  beforeEach(() => {
    db = createTestDb();
  });

  it("filters positions by accountId", async () => {
    // Insert positions - some with accountId, some without
    // We need to insert directly since InsertPositionSchema doesn't have accountId
    // Use the db directly for these test inserts
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
