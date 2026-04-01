/**
 * VirtualPortfolio Unit Tests
 *
 * Tests cover:
 * - Open/close position lifecycle
 * - P&L calculation for BUY and SELL directions
 * - Spread + slippage applied to fills
 * - Mark-to-market equity tracking
 * - Multiple concurrent positions
 * - Stop/limit hit detection
 * - Edge cases (close non-existent, open with zero size)
 */

import { describe, it, expect, beforeEach } from "vitest";
import { VirtualPortfolio } from "./portfolio.js";
import type { BarInfo } from "./portfolio.js";
import type { StrategySignal } from "../strategy/strategy-runner.js";
import type { SizingResult } from "../strategy/position-sizer.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const CAPITAL = 10_000;
const SPREAD = 1;
const SLIPPAGE = 0.5;
const EXEC_COST = SPREAD + SLIPPAGE; // 1.5 points

function makeSignal(override: Partial<StrategySignal> = {}): StrategySignal {
  return {
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
    ...override,
  };
}

function makeSizing(override: Partial<SizingResult> = {}): SizingResult {
  return {
    size: 2,
    riskAmount: 100,
    stopDistance: 100,
    riskRewardRatio: 2,
    passesRiskReward: true,
    approved: true,
    rejectReason: null,
    ...override,
  };
}

function makeBar(index: number, closePrice: number, timestamp?: Date): BarInfo {
  return { index, closePrice, timestamp };
}

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

describe("VirtualPortfolio — construction", () => {
  it("initialises with starting capital as cash", () => {
    const p = new VirtualPortfolio({ startingCapital: CAPITAL });
    expect(p.cash).toBe(CAPITAL);
    expect(p.getEquity()).toBe(CAPITAL);
    expect(p.getOpenPositionCount()).toBe(0);
    expect(p.getTradeHistory()).toHaveLength(0);
    expect(p.getEquityCurve()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Open position
// ---------------------------------------------------------------------------

describe("VirtualPortfolio — openPosition (BUY)", () => {
  let p: VirtualPortfolio;
  beforeEach(() => {
    p = new VirtualPortfolio({
      startingCapital: CAPITAL,
      spreadPips: SPREAD,
      slippagePips: SLIPPAGE,
    });
  });

  it("opens a BUY position at close + executionCost", () => {
    const bar = makeBar(0, 7500);
    const pos = p.openPosition(
      makeSignal({ action: "buy" }),
      makeSizing(),
      bar,
    );
    expect(pos).not.toBeNull();
    expect(pos!.direction).toBe("BUY");
    // BUY fill = 7500 + 1.5 = 7501.5
    expect(pos!.entryPrice).toBe(7500 + EXEC_COST);
    expect(pos!.size).toBe(2);
    expect(p.getOpenPositionCount()).toBe(1);
  });

  it("opens a SELL position at close - executionCost", () => {
    const bar = makeBar(0, 7500);
    const pos = p.openPosition(
      makeSignal({ action: "sell" }),
      makeSizing(),
      bar,
    );
    expect(pos).not.toBeNull();
    expect(pos!.direction).toBe("SELL");
    // SELL fill = 7500 - 1.5 = 7498.5
    expect(pos!.entryPrice).toBe(7500 - EXEC_COST);
  });

  it("rejects when sizing.approved is false", () => {
    const bar = makeBar(0, 7500);
    const pos = p.openPosition(
      makeSignal(),
      makeSizing({ approved: false }),
      bar,
    );
    expect(pos).toBeNull();
    expect(p.getOpenPositionCount()).toBe(0);
  });

  it("rejects when size is 0", () => {
    const bar = makeBar(0, 7500);
    const pos = p.openPosition(
      makeSignal(),
      makeSizing({ size: 0, approved: false }),
      bar,
    );
    expect(pos).toBeNull();
  });

  it("records entryBar and entryTimestamp", () => {
    const ts = new Date("2025-01-10T10:00:00Z");
    const bar = makeBar(5, 7500, ts);
    const pos = p.openPosition(makeSignal(), makeSizing(), bar);
    expect(pos!.entryBar).toBe(5);
    expect(pos!.entryTimestamp).toEqual(ts);
  });

  it("records stop and limit from signal", () => {
    const bar = makeBar(0, 7500);
    const pos = p.openPosition(
      makeSignal({ suggestedStop: 7400, suggestedLimit: 7700 }),
      makeSizing(),
      bar,
    );
    expect(pos!.stopLevel).toBe(7400);
    expect(pos!.limitLevel).toBe(7700);
  });
});

// ---------------------------------------------------------------------------
// Close position — BUY direction
// ---------------------------------------------------------------------------

describe("VirtualPortfolio — closePosition (BUY)", () => {
  let p: VirtualPortfolio;
  let dealId: string;

  beforeEach(() => {
    p = new VirtualPortfolio({
      startingCapital: CAPITAL,
      spreadPips: SPREAD,
      slippagePips: SLIPPAGE,
    });
    const pos = p.openPosition(
      makeSignal({ action: "buy" }),
      makeSizing({ size: 2 }),
      makeBar(0, 7500),
    )!;
    dealId = pos.dealId;
  });

  it("calculates correct P&L for a winning BUY trade", () => {
    // Entry at 7501.5. Exit at 7600 bar close → fill = 7600 - 1.5 = 7598.5
    // pnl = (7598.5 - 7501.5) * 2 = 97 * 2 = 194
    const trade = p.closePosition(dealId, makeBar(5, 7600), "signal");
    expect(trade).not.toBeNull();
    expect(trade!.pnl).toBeCloseTo(194);
    expect(trade!.exitPrice).toBeCloseTo(7600 - EXEC_COST);
    expect(trade!.barsHeld).toBe(5);
    expect(trade!.exitReason).toBe("signal");
    expect(p.getOpenPositionCount()).toBe(0);
    // Cash should increase
    expect(p.cash).toBeCloseTo(CAPITAL + 194);
  });

  it("calculates correct P&L for a losing BUY trade", () => {
    // Entry at 7501.5. Exit at 7400 → fill = 7400 - 1.5 = 7398.5
    // pnl = (7398.5 - 7501.5) * 2 = -103 * 2 = -206
    const trade = p.closePosition(dealId, makeBar(3, 7400), "stop");
    expect(trade!.pnl).toBeCloseTo(-206);
    expect(trade!.exitReason).toBe("stop");
  });

  it("returns null for unknown dealId", () => {
    const trade = p.closePosition("unknown-id", makeBar(1, 7500), "signal");
    expect(trade).toBeNull();
  });

  it("removes position from open list after close", () => {
    p.closePosition(dealId, makeBar(1, 7500), "signal");
    expect(p.getOpenPositionForEpic("IX.D.FTSE.DAILY.IP")).toBeNull();
  });

  it("adds trade to history", () => {
    p.closePosition(dealId, makeBar(1, 7550), "limit");
    expect(p.getTradeHistory()).toHaveLength(1);
    expect(p.getTradeHistory()[0].exitReason).toBe("limit");
  });
});

// ---------------------------------------------------------------------------
// Close position — SELL direction
// ---------------------------------------------------------------------------

describe("VirtualPortfolio — closePosition (SELL)", () => {
  let p: VirtualPortfolio;
  let dealId: string;

  beforeEach(() => {
    p = new VirtualPortfolio({
      startingCapital: CAPITAL,
      spreadPips: SPREAD,
      slippagePips: SLIPPAGE,
    });
    // SELL entry: fill = 7500 - 1.5 = 7498.5
    const pos = p.openPosition(
      makeSignal({ action: "sell" }),
      makeSizing({ size: 2 }),
      makeBar(0, 7500),
    )!;
    dealId = pos.dealId;
  });

  it("calculates correct P&L for a winning SELL trade", () => {
    // Entry at 7498.5. Exit at 7400 → fill = 7400 + 1.5 = 7401.5
    // pnl = (7498.5 - 7401.5) * 2 = 97 * 2 = 194
    const trade = p.closePosition(dealId, makeBar(3, 7400), "signal");
    expect(trade!.pnl).toBeCloseTo(194);
  });

  it("calculates correct P&L for a losing SELL trade", () => {
    // Entry at 7498.5. Exit at 7600 → fill = 7600 + 1.5 = 7601.5
    // pnl = (7498.5 - 7601.5) * 2 = -103 * 2 = -206
    const trade = p.closePosition(dealId, makeBar(3, 7600), "stop");
    expect(trade!.pnl).toBeCloseTo(-206);
  });
});

// ---------------------------------------------------------------------------
// Mark to market
// ---------------------------------------------------------------------------

describe("VirtualPortfolio — markToMarket", () => {
  it("records equity curve point", () => {
    const p = new VirtualPortfolio({ startingCapital: CAPITAL });
    const prices = new Map([["IX.D.FTSE.DAILY.IP", 7500]]);
    const bar = makeBar(0, 7500);
    p.markToMarket(prices, bar);
    expect(p.getEquityCurve()).toHaveLength(1);
    const point = p.getEquityCurve()[0];
    expect(point.equity).toBe(CAPITAL);
    expect(point.drawdownPct).toBe(0);
    expect(point.openPositionCount).toBe(0);
  });

  it("tracks unrealised P&L on open BUY position", () => {
    const p = new VirtualPortfolio({
      startingCapital: CAPITAL,
      spreadPips: 0,
      slippagePips: 0,
    });
    // Open at 7500 with no spread/slippage
    p.openPosition(
      makeSignal({ action: "buy" }),
      makeSizing({ size: 1 }),
      makeBar(0, 7500),
    );

    // Price moves to 7550 → unrealised profit = (7550 - 7500) * 1 = 50
    const prices = new Map([["IX.D.FTSE.DAILY.IP", 7550]]);
    p.markToMarket(prices, makeBar(1, 7550));
    const point = p.getEquityCurve()[0];
    expect(point.unrealizedPnl).toBeCloseTo(50);
    expect(point.equity).toBeCloseTo(CAPITAL + 50);
  });

  it("calculates drawdown correctly", () => {
    const p = new VirtualPortfolio({
      startingCapital: 1000,
      spreadPips: 0,
      slippagePips: 0,
    });
    // Bar 0: equity = 1000 (peak = 1000)
    p.markToMarket(new Map(), makeBar(0, 100));
    // Bar 1: force equity down via a loss
    // Open SELL at 100, then mark at 110 → loss of 10 per unit (size 1)
    p.openPosition(
      makeSignal({ action: "sell" }),
      makeSizing({ size: 1 }),
      makeBar(1, 100),
    );
    p.markToMarket(new Map([["IX.D.FTSE.DAILY.IP", 110]]), makeBar(1, 110));
    const point = p.getEquityCurve()[1];
    // Unrealised P&L = (100 - 110) * 1 = -10
    expect(point.unrealizedPnl).toBeCloseTo(-10);
    expect(point.drawdownAmount).toBeCloseTo(-10);
    expect(point.drawdownPct).toBeCloseTo(-0.01, 3); // -1%
  });
});

// ---------------------------------------------------------------------------
// Stop / limit detection
// ---------------------------------------------------------------------------

describe("VirtualPortfolio — checkStopLimit", () => {
  it("detects stop hit for BUY position", () => {
    const p = new VirtualPortfolio({ startingCapital: CAPITAL });
    const pos = p.openPosition(
      makeSignal({ action: "buy", suggestedStop: 7400, suggestedLimit: 7700 }),
      makeSizing(),
      makeBar(0, 7500),
    )!;
    expect(p.checkStopLimit(pos.dealId, 7399)).toBe("stop");
    expect(p.checkStopLimit(pos.dealId, 7400)).toBe("stop");
  });

  it("detects limit hit for BUY position", () => {
    const p = new VirtualPortfolio({ startingCapital: CAPITAL });
    const pos = p.openPosition(
      makeSignal({ action: "buy", suggestedStop: 7400, suggestedLimit: 7700 }),
      makeSizing(),
      makeBar(0, 7500),
    )!;
    expect(p.checkStopLimit(pos.dealId, 7701)).toBe("limit");
    expect(p.checkStopLimit(pos.dealId, 7700)).toBe("limit");
  });

  it("detects stop hit for SELL position", () => {
    const p = new VirtualPortfolio({ startingCapital: CAPITAL });
    const pos = p.openPosition(
      makeSignal({ action: "sell", suggestedStop: 7600, suggestedLimit: 7300 }),
      makeSizing(),
      makeBar(0, 7500),
    )!;
    expect(p.checkStopLimit(pos.dealId, 7601)).toBe("stop");
  });

  it("returns null for no hit", () => {
    const p = new VirtualPortfolio({ startingCapital: CAPITAL });
    const pos = p.openPosition(
      makeSignal({ action: "buy", suggestedStop: 7400, suggestedLimit: 7700 }),
      makeSizing(),
      makeBar(0, 7500),
    )!;
    expect(p.checkStopLimit(pos.dealId, 7500)).toBeNull();
  });

  it("returns null for unknown dealId", () => {
    const p = new VirtualPortfolio({ startingCapital: CAPITAL });
    expect(p.checkStopLimit("does-not-exist", 7500)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Multiple concurrent positions
// ---------------------------------------------------------------------------

describe("VirtualPortfolio — multiple positions", () => {
  it("tracks multiple concurrent positions independently", () => {
    const p = new VirtualPortfolio({
      startingCapital: CAPITAL,
      spreadPips: 0,
      slippagePips: 0,
    });

    const pos1 = p.openPosition(
      makeSignal({ epic: "EPIC_A", action: "buy" }),
      makeSizing({ size: 1 }),
      makeBar(0, 100),
    )!;
    const pos2 = p.openPosition(
      makeSignal({ epic: "EPIC_B", action: "sell" }),
      makeSizing({ size: 1 }),
      makeBar(0, 200),
    )!;

    expect(p.getOpenPositionCount()).toBe(2);

    // Close pos1 at profit, pos2 at loss
    const t1 = p.closePosition(pos1.dealId, makeBar(5, 110), "signal"); // pnl = 10
    const t2 = p.closePosition(pos2.dealId, makeBar(5, 210), "stop"); // pnl = 200 - 210 = -10

    expect(t1!.pnl).toBeCloseTo(10);
    expect(t2!.pnl).toBeCloseTo(-10);
    expect(p.getOpenPositionCount()).toBe(0);
    expect(p.getTradeHistory()).toHaveLength(2);
    // Net cash should be roughly unchanged (10 - 10 = 0)
    expect(p.cash).toBeCloseTo(CAPITAL);
  });
});

// ---------------------------------------------------------------------------
// updateStop
// ---------------------------------------------------------------------------

describe("VirtualPortfolio — updateStop", () => {
  it("updates stop level on open position", () => {
    const p = new VirtualPortfolio({ startingCapital: CAPITAL });
    const pos = p.openPosition(
      makeSignal({ suggestedStop: 7400 }),
      makeSizing(),
      makeBar(0, 7500),
    )!;
    p.updateStop(pos.dealId, 7450);
    const updated = p.getOpenPositions()[0];
    expect(updated.stopLevel).toBe(7450);
  });

  it("ignores unknown dealId gracefully", () => {
    const p = new VirtualPortfolio({ startingCapital: CAPITAL });
    expect(() => p.updateStop("nonexistent", 7450)).not.toThrow();
  });
});
