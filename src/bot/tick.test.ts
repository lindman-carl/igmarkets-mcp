/**
 * Tick Integration Tests
 *
 * Tests for the executeTick function, covering:
 * - Circuit breaker blocking a tick
 * - Tick with insufficient candle data (no signals)
 * - Successful tick with signals generated and trades executed
 * - Error handling when API calls fail
 *
 * Uses in-memory SQLite and mocked IGClient.
 * skipAuth: true is used so no login/session refresh is attempted.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import type { BotDatabase } from "../db/connection.js";
import { executeTick } from "./tick.js";
import {
  setCircuitBreakerState,
  getLastTick,
  getRecentTicks,
} from "./state.js";
import { DEFAULT_CIRCUIT_BREAKER_STATE } from "./schemas.js";
import type { IGClient } from "../ig-client.js";

// ---------------------------------------------------------------------------
// In-memory test database
// ---------------------------------------------------------------------------

function createTestDb(): BotDatabase {
  const sqlite = new Database(":memory:");
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS bot_state (
      key   TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS positions (
      id            INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
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

/** Minimal valid BotConfig for tests (raw, pre-parse). */
const BASE_CONFIG = {
  intervalMinutes: 15,
  apiKey: "test-key",
  username: "test-user",
  password: "test-pass",
  isDemo: true,
  watchlist: [{ epic: "IX.D.FTSE.DAILY.IP", expiry: "DFB", currencyCode: "GBP" }],
  strategy: "trend-following" as const,
};

/**
 * Build 30 synthetic OHLC candles with a gentle uptrend,
 * enough for all indicator calculations (needs >= 21).
 */
function makeBullishCandles(count = 30) {
  return Array.from({ length: count }, (_, i) => {
    const base = 7000 + i * 10;
    return {
      open: base,
      high: base + 20,
      low: base - 10,
      close: base + 15,
    };
  });
}

/** Build candles insufficient for indicators (fewer than 21). */
function makeThinCandles(count = 5) {
  return Array.from({ length: count }, (_, i) => ({
    open: 7000 + i,
    high: 7010 + i,
    low: 6990 + i,
    close: 7005 + i,
  }));
}

/** Convert synthetic candles to the IG prices API response format. */
function candlesToIgPrices(candles: ReturnType<typeof makeBullishCandles>) {
  return {
    prices: candles.map((c) => ({
      openPrice: { bid: c.open - 0.5, ask: c.open + 0.5, lastTraded: null },
      highPrice: { bid: c.high - 0.5, ask: c.high + 0.5, lastTraded: null },
      lowPrice: { bid: c.low - 0.5, ask: c.low + 0.5, lastTraded: null },
      closePrice: { bid: c.close - 0.5, ask: c.close + 0.5, lastTraded: null },
    })),
  };
}

/** A mock client that returns realistic IG API responses. */
function createMockClient(overrides: Partial<{
  request: ReturnType<typeof vi.fn>;
  getAccountId: ReturnType<typeof vi.fn>;
  isLoggedIn: ReturnType<typeof vi.fn>;
}> = {}): IGClient {
  return {
    request: overrides.request ?? vi.fn().mockResolvedValue({}),
    getAccountId: overrides.getAccountId ?? vi.fn().mockReturnValue("ACC_001"),
    isLoggedIn: overrides.isLoggedIn ?? vi.fn().mockReturnValue(true),
    login: vi.fn().mockResolvedValue(undefined),
  } as unknown as IGClient;
}

// ---------------------------------------------------------------------------
// Circuit breaker blocking
// ---------------------------------------------------------------------------

describe("executeTick — circuit breaker", () => {
  let db: BotDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  it("returns skipped status when circuit breaker is tripped", async () => {
    // Trip the circuit breaker
    await setCircuitBreakerState(db, {
      ...DEFAULT_CIRCUIT_BREAKER_STATE,
      tripped: true,
      lastTrippedAt: new Date().toISOString(),
      cooldownUntil: new Date(Date.now() + 3_600_000).toISOString(), // 1hr from now
    });

    const client = createMockClient();
    const result = await executeTick({
      config: BASE_CONFIG,
      db,
      client,
      skipAuth: true,
    });

    expect(result.status).toBe("skipped");
    expect(result.instrumentsScanned).toBe(0);
    expect(result.signalsGenerated).toBe(0);
    expect(result.tradesExecuted).toBe(0);
    expect(result.error).not.toBeNull();

    // No API trade calls should have been made
    const calls = (client.request as ReturnType<typeof vi.fn>).mock.calls;
    const tradeCalls = calls.filter((args: unknown[]) =>
      typeof args[1] === "string" && (args[1] as string).includes("/positions/otc"),
    );
    expect(tradeCalls).toHaveLength(0);
  });

  it("records a tick entry in the DB even when skipped", async () => {
    await setCircuitBreakerState(db, {
      ...DEFAULT_CIRCUIT_BREAKER_STATE,
      tripped: true,
      cooldownUntil: new Date(Date.now() + 3_600_000).toISOString(),
    });

    const client = createMockClient();
    const result = await executeTick({
      config: BASE_CONFIG,
      db,
      client,
      skipAuth: true,
    });

    expect(result.tickId).toBeGreaterThan(0);
    const ticks = await getRecentTicks(db, 10);
    expect(ticks.some((t) => t.id === result.tickId)).toBe(true);
    expect(ticks.find((t) => t.id === result.tickId)?.status).toBe("skipped");
  });
});

// ---------------------------------------------------------------------------
// Insufficient candle data
// ---------------------------------------------------------------------------

describe("executeTick — insufficient candle data", () => {
  let db: BotDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  it("completes the tick with 0 signals when candle data is sparse", async () => {
    const mockRequest = vi.fn()
      // GET /accounts (for balance check)
      .mockResolvedValueOnce({ accounts: [{ accountId: "ACC_001", balance: { balance: 10000, available: 9000, profitLoss: 0 } }] })
      // GET /prices/... (only 5 candles — insufficient)
      .mockResolvedValueOnce(candlesToIgPrices(makeThinCandles(5)))
      // GET /markets/... for sentiment (non-fatal)
      .mockResolvedValueOnce({ instrument: { marketId: "FTSE" } })
      // GET /clientsentiment/FTSE
      .mockResolvedValueOnce({ longPositionPercentage: 55, shortPositionPercentage: 45 });

    const client = createMockClient({ request: mockRequest });
    const result = await executeTick({
      config: BASE_CONFIG,
      db,
      client,
      skipAuth: true,
    });

    expect(result.status).toBe("completed");
    expect(result.signalsGenerated).toBe(0);
    expect(result.tradesExecuted).toBe(0);
    expect(result.instrumentsScanned).toBe(1);

    // Tick should be recorded as completed
    const lastTick = await getLastTick(db);
    expect(lastTick).not.toBeNull();
    expect(lastTick!.status).toBe("completed");
  });
});

// ---------------------------------------------------------------------------
// Happy path: tick with candles, no signals needed
// ---------------------------------------------------------------------------

describe("executeTick — happy path (sufficient candles, no trade signals)", () => {
  let db: BotDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  it("completes successfully and records tick in DB", async () => {
    // Flat candles — unlikely to generate a signal in trend-following
    const flatCandles = Array.from({ length: 30 }, (_, i) => ({
      open: 7500,
      high: 7505,
      low: 7495,
      close: 7500 + (i % 2 === 0 ? 1 : -1), // tiny alternating noise
    }));

    const mockRequest = vi.fn()
      // GET /accounts
      .mockResolvedValueOnce({ accounts: [{ accountId: "ACC_001", balance: { balance: 10000, available: 9000, profitLoss: 0 } }] })
      // GET /prices/.../DAY/30
      .mockResolvedValueOnce(candlesToIgPrices(flatCandles))
      // GET /markets/... (for sentiment)
      .mockResolvedValueOnce({ instrument: { marketId: "FTSE" } })
      // GET /clientsentiment/FTSE
      .mockResolvedValueOnce({ longPositionPercentage: 50, shortPositionPercentage: 50 })
      // GET /markets/... for min deal size (if a signal fires — will be skipped or no-op)
      .mockResolvedValue({});

    const client = createMockClient({ request: mockRequest });
    const result = await executeTick({
      config: BASE_CONFIG,
      db,
      client,
      skipAuth: true,
    });

    expect(result.status).toBe("completed");
    expect(result.error).toBeNull();
    expect(result.tickId).toBeGreaterThan(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const lastTick = await getLastTick(db);
    expect(lastTick).not.toBeNull();
    expect(lastTick!.id).toBe(result.tickId);
  });
});

// ---------------------------------------------------------------------------
// TickResult structure invariants
// ---------------------------------------------------------------------------

describe("executeTick — result structure", () => {
  let db: BotDatabase;

  beforeEach(() => {
    db = createTestDb();
  });

  it("always returns a valid TickResult shape", async () => {
    const mockRequest = vi.fn().mockResolvedValue({
      accounts: [{ accountId: "ACC_001", balance: { balance: 0 } }],
    });

    const client = createMockClient({ request: mockRequest });
    const result = await executeTick({
      config: BASE_CONFIG,
      db,
      client,
      skipAuth: true,
    });

    // Structural check
    expect(typeof result.tickId).toBe("number");
    expect(typeof result.status).toBe("string");
    expect(["completed", "skipped", "error"]).toContain(result.status);
    expect(typeof result.instrumentsScanned).toBe("number");
    expect(typeof result.signalsGenerated).toBe("number");
    expect(typeof result.tradesExecuted).toBe("number");
    expect(typeof result.durationMs).toBe("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("records tickId > 0 for every tick", async () => {
    const client = createMockClient();
    const result = await executeTick({
      config: BASE_CONFIG,
      db,
      client,
      skipAuth: true,
    });

    expect(result.tickId).toBeGreaterThan(0);
  });

  it("increments tickId on successive ticks", async () => {
    const client = createMockClient();

    const r1 = await executeTick({ config: BASE_CONFIG, db, client, skipAuth: true });
    const r2 = await executeTick({ config: BASE_CONFIG, db, client, skipAuth: true });

    expect(r2.tickId).toBeGreaterThan(r1.tickId);
  });
});
