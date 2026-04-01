/**
 * Backtest Engine Integration Tests
 *
 * Tests cover:
 * - runBacktest() with pre-provided synthetic candle data (no DB loading)
 * - runBacktest() with DB (PGlite): candle loading, run persistence, trade/equity persistence
 * - Multi-instrument simulation
 * - Metrics are plausible (not NaN, within expected ranges)
 * - Warnings generated for missing candles
 * - PLAN TASK 6.1
 */

import { describe, it, expect, beforeEach } from "vitest";
import { runBacktest, loadCandles, type BacktestCandle } from "./backtest.js";
import { createTestDb } from "../test/create-test-db.js";
import type { BacktestConfig } from "./backtest-schemas.js";
import {
  getBacktestRun,
  getBacktestTrades,
  getBacktestEquity,
} from "./backtest-state.js";
import type { BotDatabase } from "../db/connection.js";
import { upsertCandles } from "./state.js";

// ---------------------------------------------------------------------------
// Helpers — synthetic candle generation
// ---------------------------------------------------------------------------

/** Generate N candles with a simple trending price series. */
function makeTrendingCandles(
  n: number,
  startPrice: number,
  trendPerBar = 5,
): BacktestCandle[] {
  const candles: BacktestCandle[] = [];
  for (let i = 0; i < n; i++) {
    const base = startPrice + i * trendPerBar;
    const ts = new Date(2024, 0, i + 1); // Jan 1, 2, 3 ...
    candles.push({
      open: base - 2,
      high: base + 10,
      low: base - 10,
      close: base,
      timestamp: ts,
      volume: 1000,
    });
  }
  return candles;
}

/** Generate N candles with a flat / range-bound price series. */
function makeFlatCandles(n: number, price: number): BacktestCandle[] {
  return Array.from({ length: n }, (_, i) => ({
    open: price - 1,
    high: price + 5,
    low: price - 5,
    close: price,
    timestamp: new Date(2024, 0, i + 1),
    volume: 500,
  }));
}

const EPIC = "IX.D.FTSE.DAILY.IP";
const INSTRUMENT = { epic: EPIC, expiry: "DFB", currencyCode: "GBP" };

function makeConfig(overrides: Partial<BacktestConfig> = {}): BacktestConfig {
  return {
    strategyName: "trend-following",
    instruments: [INSTRUMENT],
    startingCapital: 10_000,
    dateRange: {
      from: new Date("2024-01-01"),
      to: new Date("2024-12-31"),
    },
    resolution: "DAY",
    spreadPips: 1,
    slippagePips: 0.5,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// runBacktest — no DB, synthetic candles
// ---------------------------------------------------------------------------

describe("runBacktest — in-memory (no DB)", () => {
  it("returns a result with expected shape", async () => {
    const candles = makeTrendingCandles(60, 7000);
    const candleMap = new Map([[EPIC, candles]]);
    const result = await runBacktest(makeConfig(), candleMap);

    expect(result).toMatchObject({
      runId: undefined,
      warnings: expect.any(Array),
      trades: expect.any(Array),
      equityCurve: expect.any(Array),
      durationMs: expect.any(Number),
    });
    expect(result.metrics).toBeDefined();
    expect(result.startedAt).toBeInstanceOf(Date);
    expect(result.completedAt).toBeInstanceOf(Date);
  });

  it("returns metrics with finite numbers", async () => {
    const candles = makeTrendingCandles(80, 7000);
    const result = await runBacktest(makeConfig(), new Map([[EPIC, candles]]));

    const m = result.metrics;
    expect(Number.isFinite(m.finalEquity)).toBe(true);
    expect(Number.isFinite(m.totalReturn)).toBe(true);
    expect(m.finalEquity).toBeGreaterThan(0);
    expect(m.totalBarsProcessed).toBeGreaterThan(0);
  });

  it("warns and returns empty trades when no candles provided", async () => {
    const result = await runBacktest(makeConfig(), new Map());

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain(EPIC);
    expect(result.trades).toHaveLength(0);
  });

  it("emits a warning for missing sentiment data when using sentiment-contrarian", async () => {
    const candles = makeTrendingCandles(60, 7000);
    const result = await runBacktest(
      makeConfig({ strategyName: "sentiment-contrarian" }),
      new Map([[EPIC, candles]]),
    );
    // Should warn that no sentiment data is available
    expect(
      result.warnings.some((w) => w.toLowerCase().includes("sentiment")),
    ).toBe(true);
  });

  it("forces-close all open positions at end of run", async () => {
    // Use enough candles for indicators but few enough that position may still be open
    const candles = makeTrendingCandles(30, 7000, 10); // strong up-trend → likely BUY
    const result = await runBacktest(makeConfig(), new Map([[EPIC, candles]]));

    // All trades should be closed (none with undefined exitBar)
    for (const t of result.trades) {
      expect(t.exitBar).toBeGreaterThanOrEqual(0);
    }
  });

  it("keeps final equity positive for a simple uptrend", async () => {
    const candles = makeTrendingCandles(100, 7000, 10); // strong up trend
    const result = await runBacktest(makeConfig(), new Map([[EPIC, candles]]));
    // With a strong up-trend and trend-following strategy, we expect positive equity
    expect(result.metrics.finalEquity).toBeGreaterThan(0);
  });

  it("returns trade statistics within valid ranges", async () => {
    const candles = makeTrendingCandles(100, 7000);
    const result = await runBacktest(makeConfig(), new Map([[EPIC, candles]]));

    const m = result.metrics;
    if (m.totalTrades > 0) {
      expect(m.winRate).toBeGreaterThanOrEqual(0);
      expect(m.winRate).toBeLessThanOrEqual(1);
      expect(m.profitFactor).toBeGreaterThanOrEqual(0);
      expect(m.winningTrades + m.losingTrades).toBe(m.totalTrades);
    }
  });

  it("equity curve has one point per processed bar", async () => {
    const n = 60;
    const candles = makeTrendingCandles(n, 7000);
    const result = await runBacktest(makeConfig(), new Map([[EPIC, candles]]));

    // Equity curve points should equal processed bars (after warmup)
    expect(result.equityCurve.length).toBe(result.metrics.totalBarsProcessed);
  });

  it("handles multi-instrument simulation", async () => {
    const epic2 = "CS.D.AAPL.CFD.IP";
    const candles1 = makeTrendingCandles(60, 7000, 5);
    const candles2 = makeTrendingCandles(60, 150, 0.5);

    const config = makeConfig({
      instruments: [
        INSTRUMENT,
        { epic: epic2, expiry: "DFB", currencyCode: "USD" },
      ],
    });

    const candleMap = new Map([
      [EPIC, candles1],
      [epic2, candles2],
    ]);

    const result = await runBacktest(config, candleMap);
    expect(result.metrics.totalBarsProcessed).toBeGreaterThan(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("handles flat candles without crashing", async () => {
    const candles = makeFlatCandles(60, 7500);
    const result = await runBacktest(makeConfig(), new Map([[EPIC, candles]]));
    expect(result.metrics.finalEquity).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// runBacktest — with DB persistence (PGlite)
// ---------------------------------------------------------------------------

describe("runBacktest — with DB persistence", () => {
  let db: BotDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("creates a backtest_runs row with status='completed'", async () => {
    const candles = makeTrendingCandles(60, 7000);
    const result = await runBacktest(
      makeConfig(),
      new Map([[EPIC, candles]]),
      db,
    );

    expect(result.runId).toBeTypeOf("number");
    expect(result.runId).toBeGreaterThan(0);

    const row = await getBacktestRun(db, result.runId!);
    expect(row).not.toBeNull();
    expect(row!.status).toBe("completed");
    expect(row!.strategyName).toBe("trend-following");
  });

  it("persists trade rows when trades are executed", async () => {
    const candles = makeTrendingCandles(100, 7000, 8);
    const result = await runBacktest(
      makeConfig(),
      new Map([[EPIC, candles]]),
      db,
    );

    if (result.metrics.totalTrades > 0) {
      const trades = await getBacktestTrades(db, result.runId!);
      expect(trades).toHaveLength(result.metrics.totalTrades);
      expect(trades[0]!.runId).toBe(result.runId);
      expect(trades[0]!.epic).toBe(EPIC);
    }
  });

  it("persists equity curve rows", async () => {
    const candles = makeTrendingCandles(60, 7000);
    const result = await runBacktest(
      makeConfig(),
      new Map([[EPIC, candles]]),
      db,
    );

    if (result.equityCurve.length > 0) {
      const equity = await getBacktestEquity(db, result.runId!);
      expect(equity).toHaveLength(result.equityCurve.length);
      expect(equity[0]!.runId).toBe(result.runId);
    }
  });

  it("saves metrics JSON in the run row", async () => {
    const candles = makeTrendingCandles(80, 7000);
    const result = await runBacktest(
      makeConfig(),
      new Map([[EPIC, candles]]),
      db,
    );

    const row = await getBacktestRun(db, result.runId!);
    expect(row!.metrics).not.toBeNull();
    const metrics = row!.metrics as Record<string, unknown>;
    expect(typeof metrics.totalReturn).toBe("number");
  });
});

// ---------------------------------------------------------------------------
// loadCandles
// ---------------------------------------------------------------------------

describe("loadCandles — DB candle loading", () => {
  let db: BotDatabase;

  beforeEach(async () => {
    db = await createTestDb();
  });

  it("returns empty array when no candles in DB", async () => {
    const result = await loadCandles(
      db,
      "EPIC.NONE",
      "DAY",
      new Date("2024-01-01"),
      new Date("2024-12-31"),
    );
    expect(result).toHaveLength(0);
  });

  it("loads candles from DB after upsert", async () => {
    const ts1 = new Date("2024-06-01T00:00:00Z");
    const ts2 = new Date("2024-06-02T00:00:00Z");

    await upsertCandles(db, [
      {
        epic: EPIC,
        resolution: "DAY",
        timestamp: ts1,
        open: 7000,
        high: 7050,
        low: 6950,
        close: 7010,
      },
      {
        epic: EPIC,
        resolution: "DAY",
        timestamp: ts2,
        open: 7010,
        high: 7060,
        low: 6960,
        close: 7020,
      },
    ]);

    const candles = await loadCandles(
      db,
      EPIC,
      "DAY",
      new Date("2024-01-01"),
      new Date("2024-12-31"),
    );

    expect(candles).toHaveLength(2);
    expect(candles[0]!.close).toBe(7010);
    expect(candles[1]!.close).toBe(7020);
  });

  it("respects date range boundaries", async () => {
    const candles = [
      {
        epic: EPIC,
        resolution: "DAY",
        timestamp: new Date("2024-05-01T00:00:00Z"),
        open: 100,
        high: 110,
        low: 90,
        close: 105,
      },
      {
        epic: EPIC,
        resolution: "DAY",
        timestamp: new Date("2024-06-15T00:00:00Z"),
        open: 105,
        high: 115,
        low: 95,
        close: 110,
      },
      {
        epic: EPIC,
        resolution: "DAY",
        timestamp: new Date("2024-08-01T00:00:00Z"),
        open: 110,
        high: 120,
        low: 100,
        close: 115,
      },
    ];
    await upsertCandles(db, candles);

    const result = await loadCandles(
      db,
      EPIC,
      "DAY",
      new Date("2024-06-01"),
      new Date("2024-07-31"),
    );
    expect(result).toHaveLength(1);
    expect(result[0]!.close).toBe(110);
  });
});
