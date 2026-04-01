/**
 * Executor Tests
 *
 * Tests for executeOpenTrade and executeCloseTrade.
 * Uses an in-memory SQLite database and a mocked IGClient.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "../db/schema.js";
import type { BotDatabase } from "../db/connection.js";
import { executeOpenTrade, executeCloseTrade } from "./executor.js";
import type { StrategySignal } from "./strategy-runner.js";
import type { SizingResult } from "./position-sizer.js";
import type { WatchlistItem } from "./schemas.js";
import {
  getPositionByDealId,
  getTradesByTick,
  startTick,
  insertPosition,
} from "./state.js";
import type { IGClient } from "../ig-client.js";

// ---------------------------------------------------------------------------
// In-memory test database (same DDL as migration)
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

const NOW = new Date().toISOString();

const SIGNAL_BUY: StrategySignal = {
  epic: "IX.D.FTSE.DAILY.IP",
  strategy: "trend-following",
  action: "buy",
  signalType: "entry",
  confidence: 0.8,
  priceAtSignal: 7500,
  suggestedStop: 7400,
  suggestedLimit: 7700,
  suggestedSize: 2,
  indicatorData: {},
};

const SIGNAL_SELL: StrategySignal = {
  epic: "IX.D.FTSE.DAILY.IP",
  strategy: "trend-following",
  action: "sell",
  signalType: "entry",
  confidence: 0.7,
  priceAtSignal: 7500,
  suggestedStop: 7600,
  suggestedLimit: 7300,
  suggestedSize: 2,
  indicatorData: {},
};

const SIZING_APPROVED: SizingResult = {
  approved: true,
  size: 2,
  stopDistance: 100,
  riskRewardRatio: 2,
  passesRiskReward: true,
  riskAmount: 200,
  rejectReason: null,
};

const SIZING_REJECTED: SizingResult = {
  approved: false,
  size: 0,
  stopDistance: 0,
  riskRewardRatio: null,
  passesRiskReward: false,
  riskAmount: 0,
  rejectReason: "max_positions_reached",
};

const WATCHLIST_ITEM: WatchlistItem = {
  epic: "IX.D.FTSE.DAILY.IP",
  expiry: "DFB",
  currencyCode: "GBP",
};

// ---------------------------------------------------------------------------
// Mock IGClient factory
// ---------------------------------------------------------------------------

function createMockClient(
  overrides: Partial<{ request: ReturnType<typeof vi.fn> }> = {},
): IGClient {
  return {
    request: overrides.request ?? vi.fn(),
  } as unknown as IGClient;
}

// ---------------------------------------------------------------------------
// executeOpenTrade tests
// ---------------------------------------------------------------------------

describe("executeOpenTrade", () => {
  let db: BotDatabase;
  let tickId: number;

  beforeEach(async () => {
    db = createTestDb();
    tickId = await startTick(db, { startedAt: NOW, status: "running" });
  });

  it("returns REJECTED immediately when sizing is not approved", async () => {
    const client = createMockClient();
    const result = await executeOpenTrade(client, db, {
      signal: SIGNAL_BUY,
      sizing: SIZING_REJECTED,
      watchlistItem: WATCHLIST_ITEM,
      tickId,
      signalId: 1,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("REJECTED");
    expect(result.rejectReason).toBe("max_positions_reached");
    expect(result.dealReference).toBeNull();
    expect(result.tradeId).toBeNull();
    // No API call should have been made
    expect((client.request as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0);
  });

  it("records a PENDING trade then updates to REJECTED when no dealReference returned", async () => {
    const client = createMockClient({
      request: vi.fn().mockResolvedValueOnce({}), // POST returns no dealReference
    });

    const result = await executeOpenTrade(client, db, {
      signal: SIGNAL_BUY,
      sizing: SIZING_APPROVED,
      watchlistItem: WATCHLIST_ITEM,
      tickId,
      signalId: 1,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("REJECTED");
    expect(result.rejectReason).toBe("No deal reference returned");
    expect(result.tradeId).toBeGreaterThan(0);

    // Trade should be recorded in DB with REJECTED status
    const trades = await getTradesByTick(db, tickId);
    expect(trades).toHaveLength(1);
    expect(trades[0].status).toBe("REJECTED");
  });

  it("records position and returns OPEN on successful deal confirmation", async () => {
    const mockRequest = vi.fn()
      .mockResolvedValueOnce({ dealReference: "REF_001" })  // POST /positions/otc
      .mockResolvedValueOnce({                               // GET /confirms/REF_001
        dealStatus: "ACCEPTED",
        dealId: "DEAL_001",
        level: 7502,
      });

    const client = createMockClient({ request: mockRequest });

    const result = await executeOpenTrade(client, db, {
      signal: SIGNAL_BUY,
      sizing: SIZING_APPROVED,
      watchlistItem: WATCHLIST_ITEM,
      tickId,
      signalId: 1,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("OPEN");
    expect(result.dealReference).toBe("REF_001");
    expect(result.dealId).toBe("DEAL_001");
    expect(result.tradeId).toBeGreaterThan(0);

    // Verify trade record updated in DB
    const trades = await getTradesByTick(db, tickId);
    expect(trades[0].status).toBe("OPEN");
    expect(trades[0].dealId).toBe("DEAL_001");
    expect(trades[0].executionPrice).toBeCloseTo(7502);

    // Verify position tracked in DB
    const pos = await getPositionByDealId(db, "DEAL_001");
    expect(pos).not.toBeNull();
    expect(pos!.epic).toBe("IX.D.FTSE.DAILY.IP");
    expect(pos!.direction).toBe("BUY");
    expect(pos!.entryPrice).toBeCloseTo(7502);
    expect(pos!.status).toBe("open");
  });

  it("returns REJECTED when deal confirmation status is not ACCEPTED", async () => {
    const mockRequest = vi.fn()
      .mockResolvedValueOnce({ dealReference: "REF_002" })
      .mockResolvedValueOnce({
        dealStatus: "REJECTED",
        dealId: "DEAL_002",
        reason: "INSUFFICIENT_FUNDS",
        level: 0,
      });

    const client = createMockClient({ request: mockRequest });

    const result = await executeOpenTrade(client, db, {
      signal: SIGNAL_BUY,
      sizing: SIZING_APPROVED,
      watchlistItem: WATCHLIST_ITEM,
      tickId,
      signalId: 1,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("REJECTED");
    expect(result.rejectReason).toBe("INSUFFICIENT_FUNDS");

    // No position should be tracked
    const pos = await getPositionByDealId(db, "DEAL_002");
    expect(pos).toBeNull();
  });

  it("handles API errors gracefully and returns ERROR status", async () => {
    const mockRequest = vi.fn().mockRejectedValueOnce(new Error("Network timeout"));

    const client = createMockClient({ request: mockRequest });

    const result = await executeOpenTrade(client, db, {
      signal: SIGNAL_BUY,
      sizing: SIZING_APPROVED,
      watchlistItem: WATCHLIST_ITEM,
      tickId,
      signalId: 1,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("ERROR");
    expect(result.rejectReason).toBe("Network timeout");
    expect(result.tradeId).toBeGreaterThan(0);

    // Trade should be recorded as REJECTED (error path)
    const trades = await getTradesByTick(db, tickId);
    expect(trades[0].status).toBe("REJECTED");
    expect(trades[0].rejectReason).toBe("Network timeout");
  });

  it("works for SELL direction signal", async () => {
    const mockRequest = vi.fn()
      .mockResolvedValueOnce({ dealReference: "REF_SELL" })
      .mockResolvedValueOnce({
        dealStatus: "ACCEPTED",
        dealId: "DEAL_SELL",
        level: 7498,
      });

    const client = createMockClient({ request: mockRequest });

    const result = await executeOpenTrade(client, db, {
      signal: SIGNAL_SELL,
      sizing: SIZING_APPROVED,
      watchlistItem: WATCHLIST_ITEM,
      tickId,
      signalId: 2,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("OPEN");

    const pos = await getPositionByDealId(db, "DEAL_SELL");
    expect(pos!.direction).toBe("SELL");
  });

  it("sends correct body to the IG API", async () => {
    const mockRequest = vi.fn()
      .mockResolvedValueOnce({ dealReference: "REF_BODY" })
      .mockResolvedValueOnce({ dealStatus: "ACCEPTED", dealId: "DEAL_BODY", level: 7500 });

    const client = createMockClient({ request: mockRequest });

    await executeOpenTrade(client, db, {
      signal: SIGNAL_BUY,
      sizing: SIZING_APPROVED,
      watchlistItem: WATCHLIST_ITEM,
      tickId,
      signalId: 1,
    });

    const [method, path, opts] = mockRequest.mock.calls[0];
    expect(method).toBe("POST");
    expect(path).toBe("/positions/otc");
    expect(opts.body).toMatchObject({
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "BUY",
      size: 2,
      expiry: "DFB",
      currencyCode: "GBP",
      forceOpen: true,
      guaranteedStop: false,
      orderType: "MARKET",
    });
  });
});

// ---------------------------------------------------------------------------
// executeCloseTrade tests
// ---------------------------------------------------------------------------

describe("executeCloseTrade", () => {
  let db: BotDatabase;
  let tickId: number;

  beforeEach(async () => {
    db = createTestDb();
    tickId = await startTick(db, { startedAt: NOW, status: "running" });
    // Pre-insert a tracked position to close
    await insertPosition(db, {
      dealId: "DEAL_OPEN",
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "BUY",
      size: 2,
      entryPrice: 7500,
      currencyCode: "GBP",
      expiry: "DFB",
      openedAt: NOW,
      status: "open",
    });
  });

  it("returns REJECTED when no dealReference returned from close", async () => {
    const client = createMockClient({
      request: vi.fn().mockResolvedValueOnce({}),
    });

    const result = await executeCloseTrade(client, db, {
      dealId: "DEAL_OPEN",
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "BUY",
      size: 2,
      tickId,
      signalId: null,
      currencyCode: "GBP",
      expiry: "DFB",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("REJECTED");
    expect(result.rejectReason).toBe("No deal reference returned for close");
  });

  it("closes position in DB on successful confirmation", async () => {
    const mockRequest = vi.fn()
      .mockResolvedValueOnce({ dealReference: "REF_CLOSE" })        // DELETE
      .mockResolvedValueOnce({                                        // GET /confirms
        dealStatus: "ACCEPTED",
        dealId: "DEAL_CLOSE_OUT",
        level: 7650,
      });

    const client = createMockClient({ request: mockRequest });

    const result = await executeCloseTrade(client, db, {
      dealId: "DEAL_OPEN",
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "BUY",
      size: 2,
      tickId,
      signalId: null,
      currencyCode: "GBP",
      expiry: "DFB",
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("OPEN");
    expect(result.dealReference).toBe("REF_CLOSE");

    // Position should now be closed in DB
    const pos = await getPositionByDealId(db, "DEAL_OPEN");
    expect(pos!.status).toBe("closed");
    expect(pos!.exitPrice).toBeCloseTo(7650);
    // P&L: (7650 - 7500) * 2 = 300
    expect(pos!.realizedPnl).toBeCloseTo(300);
  });

  it("calculates P&L correctly for SELL positions (short)", async () => {
    // Insert a SELL position
    await insertPosition(db, {
      dealId: "DEAL_SHORT",
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "SELL",
      size: 1,
      entryPrice: 7500,
      currencyCode: "GBP",
      expiry: "DFB",
      openedAt: NOW,
      status: "open",
    });

    const mockRequest = vi.fn()
      .mockResolvedValueOnce({ dealReference: "REF_SHORT_CLOSE" })
      .mockResolvedValueOnce({ dealStatus: "ACCEPTED", dealId: "DEAL_SHORT_OUT", level: 7400 });

    const client = createMockClient({ request: mockRequest });

    await executeCloseTrade(client, db, {
      dealId: "DEAL_SHORT",
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "SELL",
      size: 1,
      tickId,
      signalId: null,
      currencyCode: "GBP",
      expiry: "DFB",
    });

    const pos = await getPositionByDealId(db, "DEAL_SHORT");
    // P&L for SELL: (entryPrice - exitPrice) * size = (7500 - 7400) * 1 = 100
    expect(pos!.realizedPnl).toBeCloseTo(100);
  });

  it("uses opposite direction when sending close request", async () => {
    const mockRequest = vi.fn()
      .mockResolvedValueOnce({ dealReference: "REF_DIR" })
      .mockResolvedValueOnce({ dealStatus: "ACCEPTED", dealId: "X", level: 7600 });

    const client = createMockClient({ request: mockRequest });

    await executeCloseTrade(client, db, {
      dealId: "DEAL_OPEN",
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "BUY",  // position direction
      size: 2,
      tickId,
      signalId: null,
      currencyCode: "GBP",
      expiry: "DFB",
    });

    // The API call body should use SELL (opposite of BUY)
    const closeBody = mockRequest.mock.calls[0][2].body;
    expect(closeBody.direction).toBe("SELL");
  });

  it("handles API errors gracefully", async () => {
    const client = createMockClient({
      request: vi.fn().mockRejectedValueOnce(new Error("Connection refused")),
    });

    const result = await executeCloseTrade(client, db, {
      dealId: "DEAL_OPEN",
      epic: "IX.D.FTSE.DAILY.IP",
      direction: "BUY",
      size: 2,
      tickId,
      signalId: null,
      currencyCode: "GBP",
      expiry: "DFB",
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe("ERROR");
    expect(result.rejectReason).toBe("Connection refused");

    // Position should remain open
    const pos = await getPositionByDealId(db, "DEAL_OPEN");
    expect(pos!.status).toBe("open");
  });
});
