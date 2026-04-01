/**
 * Backtest Metrics Unit Tests
 *
 * Tests cover:
 * - arrayMean / arrayStd helpers
 * - computeDailyReturns
 * - computeSharpe / computeSortino
 * - computeDrawdownMetrics
 * - computeTradeStats
 * - computeMetrics (integration)
 *
 * All functions are pure math — no I/O needed.
 */

import { describe, it, expect } from "vitest";
import {
  arrayMean,
  arrayStd,
  computeDailyReturns,
  computeSharpe,
  computeSortino,
  computeDrawdownMetrics,
  computeTradeStats,
  computeMetrics,
} from "./metrics.js";
import type { BacktestTrade, BacktestEquityPoint } from "./schemas.js";

// ---------------------------------------------------------------------------
// Helper builders
// ---------------------------------------------------------------------------

function makeTrade(pnl: number, barsHeld = 5): BacktestTrade {
  const direction = pnl >= 0 ? "BUY" : "SELL";
  return {
    tradeIndex: 0,
    epic: "EPIC",
    strategy: "trend-following",
    direction,
    size: 1,
    entryPrice: 100,
    exitPrice: 100 + pnl,
    entryBar: 0,
    exitBar: barsHeld,
    barsHeld,
    pnl,
    pnlPct: pnl / 100,
    exitReason: "signal",
  };
}

function makeEquityPoint(
  barIndex: number,
  equity: number,
  drawdownPct = 0,
  drawdownAmount = 0,
): BacktestEquityPoint {
  return {
    barIndex,
    equity,
    cash: equity,
    unrealizedPnl: 0,
    drawdownPct,
    drawdownAmount,
    openPositionCount: 0,
  };
}

// ---------------------------------------------------------------------------
// arrayMean
// ---------------------------------------------------------------------------

describe("arrayMean", () => {
  it("returns 0 for empty array", () => {
    expect(arrayMean([])).toBe(0);
  });

  it("returns the single value for a single-element array", () => {
    expect(arrayMean([42])).toBe(42);
  });

  it("returns the average of multiple values", () => {
    expect(arrayMean([1, 2, 3, 4, 5])).toBe(3);
  });

  it("handles negative values", () => {
    expect(arrayMean([-5, 0, 5])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// arrayStd
// ---------------------------------------------------------------------------

describe("arrayStd", () => {
  it("returns 0 for empty array", () => {
    expect(arrayStd([])).toBe(0);
  });

  it("returns 0 for single element", () => {
    expect(arrayStd([5])).toBe(0);
  });

  it("returns 0 when all values are equal", () => {
    expect(arrayStd([3, 3, 3, 3])).toBe(0);
  });

  it("computes population std correctly", () => {
    // Values: [2, 4, 4, 4, 5, 5, 7, 9] — population std = 2
    expect(arrayStd([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2);
  });
});

// ---------------------------------------------------------------------------
// computeDailyReturns
// ---------------------------------------------------------------------------

describe("computeDailyReturns", () => {
  it("returns empty array for fewer than 2 points", () => {
    expect(computeDailyReturns([])).toHaveLength(0);
    expect(computeDailyReturns([makeEquityPoint(0, 1000)])).toHaveLength(0);
  });

  it("computes correct returns for a growing equity curve", () => {
    const curve = [
      makeEquityPoint(0, 1000),
      makeEquityPoint(1, 1100), // +10%
      makeEquityPoint(2, 1210), // +10%
    ];
    const returns = computeDailyReturns(curve);
    expect(returns).toHaveLength(2);
    expect(returns[0]).toBeCloseTo(0.1);
    expect(returns[1]).toBeCloseTo(0.1);
  });

  it("handles flat equity (returns should be 0)", () => {
    const curve = [
      makeEquityPoint(0, 1000),
      makeEquityPoint(1, 1000),
      makeEquityPoint(2, 1000),
    ];
    const returns = computeDailyReturns(curve);
    expect(returns).toEqual([0, 0]);
  });

  it("handles negative returns correctly", () => {
    const curve = [makeEquityPoint(0, 1000), makeEquityPoint(1, 900)]; // -10%
    const returns = computeDailyReturns(curve);
    expect(returns[0]).toBeCloseTo(-0.1);
  });
});

// ---------------------------------------------------------------------------
// computeSharpe
// ---------------------------------------------------------------------------

describe("computeSharpe", () => {
  it("returns 0 for empty returns", () => {
    expect(computeSharpe([], 252)).toBe(0);
  });

  it("returns 0 when all returns are equal (std = 0)", () => {
    expect(computeSharpe([0.01, 0.01, 0.01], 252)).toBe(0);
  });

  it("returns a positive ratio for consistently positive returns", () => {
    // Returns are uniformly positive — Sharpe should be positive
    const returns = Array(252).fill(0.001); // 0.1% daily returns
    // Introduce tiny variation so std != 0
    const mixedReturns = returns.map(
      (r, i) => r + (i % 2 === 0 ? 0.0001 : -0.0001),
    );
    const sharpe = computeSharpe(mixedReturns, 252);
    expect(sharpe).toBeGreaterThan(0);
  });

  it("scales with sqrt of periodsPerYear", () => {
    const returns = [0.01, -0.005, 0.008, 0.003, -0.002];
    const sharpeDaily = computeSharpe(returns, 1);
    const sharpeAnnualized = computeSharpe(returns, 252);
    // Annualized should be sqrt(252) times the daily version
    expect(sharpeAnnualized).toBeCloseTo(sharpeDaily * Math.sqrt(252), 5);
  });
});

// ---------------------------------------------------------------------------
// computeSortino
// ---------------------------------------------------------------------------

describe("computeSortino", () => {
  it("returns 0 for empty returns", () => {
    expect(computeSortino([], 0, 252)).toBe(0);
  });

  it("returns Infinity when there are no downside returns", () => {
    const returns = [0.01, 0.02, 0.005]; // all positive
    expect(computeSortino(returns, 0, 252)).toBe(Infinity);
  });

  it("returns a positive value when mean return > 0 with some downside", () => {
    const returns = [0.02, -0.005, 0.015, -0.003, 0.01];
    const sortino = computeSortino(returns, 0, 252);
    expect(sortino).toBeGreaterThan(0);
  });

  it("returns a higher Sortino than Sharpe for a positively-skewed return series", () => {
    // A series with mostly small losses and occasional large gains
    const returns = [
      -0.001, -0.001, -0.001, 0.05, -0.001, -0.001, 0.04, -0.002,
    ];
    const sharpe = computeSharpe(returns, 252);
    const sortino = computeSortino(returns, 0, 252);
    // Sortino ignores upside volatility, so positive-skew → sortino > sharpe
    expect(sortino).toBeGreaterThan(sharpe);
  });
});

// ---------------------------------------------------------------------------
// computeDrawdownMetrics
// ---------------------------------------------------------------------------

describe("computeDrawdownMetrics", () => {
  it("returns all zeros for empty equity curve", () => {
    const m = computeDrawdownMetrics([]);
    expect(m.maxDrawdownPct).toBe(0);
    expect(m.maxDrawdownAmount).toBe(0);
    expect(m.maxDrawdownDurationBars).toBe(0);
    expect(m.avgDrawdownPct).toBe(0);
  });

  it("returns all zeros when there is no drawdown", () => {
    const curve = [
      makeEquityPoint(0, 1000, 0, 0),
      makeEquityPoint(1, 1050, 0, 0),
      makeEquityPoint(2, 1100, 0, 0),
    ];
    const m = computeDrawdownMetrics(curve);
    expect(m.maxDrawdownPct).toBe(0);
    expect(m.maxDrawdownAmount).toBe(0);
    expect(m.avgDrawdownPct).toBe(0);
  });

  it("calculates max drawdown correctly", () => {
    const curve = [
      makeEquityPoint(0, 1000, 0, 0),
      makeEquityPoint(1, 950, -0.05, -50),
      makeEquityPoint(2, 900, -0.1, -100), // worst
      makeEquityPoint(3, 1000, 0, 0),
    ];
    const m = computeDrawdownMetrics(curve);
    expect(m.maxDrawdownPct).toBeCloseTo(-0.1);
    expect(m.maxDrawdownAmount).toBeCloseTo(-100);
  });

  it("measures drawdown duration correctly", () => {
    const curve = [
      makeEquityPoint(0, 1000, 0, 0),
      makeEquityPoint(1, 980, -0.02, -20), // start of drawdown
      makeEquityPoint(2, 970, -0.03, -30),
      makeEquityPoint(3, 960, -0.04, -40), // 3 bars of drawdown
      makeEquityPoint(4, 1000, 0, 0), // recovery
    ];
    const m = computeDrawdownMetrics(curve);
    expect(m.maxDrawdownDurationBars).toBe(3);
  });

  it("handles drawdown still open at end of curve", () => {
    const curve = [
      makeEquityPoint(0, 1000, 0, 0),
      makeEquityPoint(1, 950, -0.05, -50),
      makeEquityPoint(2, 940, -0.06, -60), // never recovers
    ];
    const m = computeDrawdownMetrics(curve);
    expect(m.maxDrawdownDurationBars).toBe(2);
  });

  it("computes average drawdown correctly", () => {
    const curve = [
      makeEquityPoint(0, 1000, 0, 0),
      makeEquityPoint(1, 980, -0.02, -20),
      makeEquityPoint(2, 960, -0.04, -40),
      makeEquityPoint(3, 1000, 0, 0),
    ];
    const m = computeDrawdownMetrics(curve);
    // avgDrawdownPct = mean([-0.02, -0.04]) = -0.03
    expect(m.avgDrawdownPct).toBeCloseTo(-0.03);
  });
});

// ---------------------------------------------------------------------------
// computeTradeStats
// ---------------------------------------------------------------------------

describe("computeTradeStats", () => {
  it("returns zero stats for no trades", () => {
    const stats = computeTradeStats([]);
    expect(stats.totalTrades).toBe(0);
    expect(stats.winRate).toBeNaN();
    expect(stats.profitFactor).toBe(0);
    expect(stats.avgBarsHeld).toBe(0);
  });

  it("computes win rate correctly", () => {
    const trades = [makeTrade(10), makeTrade(20), makeTrade(-5), makeTrade(-8)];
    const stats = computeTradeStats(trades);
    expect(stats.totalTrades).toBe(4);
    expect(stats.winningTrades).toBe(2);
    expect(stats.losingTrades).toBe(2);
    expect(stats.winRate).toBe(0.5);
  });

  it("computes profit factor correctly", () => {
    // Gross profit = 30, Gross loss = 13 → PF = 30/13
    const trades = [makeTrade(10), makeTrade(20), makeTrade(-5), makeTrade(-8)];
    const stats = computeTradeStats(trades);
    expect(stats.profitFactor).toBeCloseTo(30 / 13);
  });

  it("sets profitFactor = Infinity when no losing trades", () => {
    const trades = [makeTrade(10), makeTrade(20)];
    const stats = computeTradeStats(trades);
    expect(stats.profitFactor).toBe(Infinity);
  });

  it("computes avgWin and avgLoss correctly", () => {
    const trades = [
      makeTrade(10),
      makeTrade(20),
      makeTrade(-5),
      makeTrade(-15),
    ];
    const stats = computeTradeStats(trades);
    expect(stats.avgWin).toBe(15);
    expect(stats.avgLoss).toBe(-10); // returned as negative value
  });

  it("computes barsHeld stats", () => {
    const trades = [makeTrade(10, 3), makeTrade(5, 7), makeTrade(-2, 5)];
    const stats = computeTradeStats(trades);
    expect(stats.avgBarsHeld).toBeCloseTo(5);
    expect(stats.maxBarsHeld).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// computeMetrics (integration)
// ---------------------------------------------------------------------------

describe("computeMetrics — integration", () => {
  it("handles no trades and flat equity curve", () => {
    const curve = [makeEquityPoint(0, 10_000), makeEquityPoint(1, 10_000)];
    const m = computeMetrics([], curve, 10_000, 2);
    expect(m.totalReturn).toBe(0);
    expect(m.totalReturnPct).toBe(0);
    expect(m.totalTrades).toBe(0);
    expect(m.finalEquity).toBe(10_000);
    expect(m.peakEquity).toBe(10_000);
    expect(m.totalBarsProcessed).toBe(2);
  });

  it("handles empty equity curve", () => {
    const m = computeMetrics([], [], 10_000, 0);
    expect(m.finalEquity).toBe(10_000);
    expect(m.sharpeRatio).toBe(0);
    expect(m.sortinoRatio).toBe(0);
  });

  it("computes totalReturn correctly with profitable trades", () => {
    const curve = [makeEquityPoint(0, 10_000), makeEquityPoint(1, 10_500)];
    const trades = [makeTrade(500)];
    const m = computeMetrics(trades, curve, 10_000, 2);
    expect(m.totalReturn).toBeCloseTo(500);
    expect(m.totalReturnPct).toBeCloseTo(0.05);
    expect(m.finalEquity).toBeCloseTo(10_500);
  });

  it("uses equity curve peak for peakEquity", () => {
    const curve = [
      makeEquityPoint(0, 10_000),
      makeEquityPoint(1, 11_000),
      makeEquityPoint(2, 10_500),
    ];
    const m = computeMetrics([], curve, 10_000, 3);
    expect(m.peakEquity).toBe(11_000);
  });
});
