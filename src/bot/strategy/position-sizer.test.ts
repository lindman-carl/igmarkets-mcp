import { describe, it, expect } from "vitest";
import {
  calculatePositionSize,
  calculateTrailingStop,
  type SizingInput,
} from "./position-sizer.js";
import type { RiskConfig } from "../core/schemas.js";
import { DEFAULT_RISK_CONFIG } from "../core/schemas.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeInput(overrides: Partial<SizingInput> = {}): SizingInput {
  return {
    accountBalance: 10_000,
    entryPrice: 100,
    stopLevel: 95, // 5-point stop → BUY
    limitLevel: 115, // 15-point target → R:R = 3.0
    direction: "BUY",
    minDealSize: 1,
    valuePerPoint: 1,
    ...overrides,
  };
}

const TIGHT_RISK: RiskConfig = {
  ...DEFAULT_RISK_CONFIG,
  maxRiskPerTradePct: 0.01, // 1%
  maxOpenPositions: 5,
  maxDailyLossPct: 0.03,
};

// ---------------------------------------------------------------------------
// calculatePositionSize
// ---------------------------------------------------------------------------

describe("calculatePositionSize", () => {
  it("calculates correct size for a standard BUY trade", () => {
    // riskAmount = 10,000 * 0.01 = 100
    // stopDistance = 100 - 95 = 5
    // size = 100 / (5 * 1) = 20
    const result = calculatePositionSize(makeInput(), TIGHT_RISK);
    expect(result.size).toBe(20);
    expect(result.riskAmount).toBeCloseTo(100);
    expect(result.stopDistance).toBeCloseTo(5);
    expect(result.approved).toBe(true);
  });

  it("calculates correct size for a SELL trade", () => {
    // entry=100, stop=105 (above entry for SELL) → stopDistance=5
    const result = calculatePositionSize(
      makeInput({ direction: "SELL", stopLevel: 105, limitLevel: 85 }),
      TIGHT_RISK,
    );
    expect(result.size).toBe(20);
    expect(result.stopDistance).toBeCloseTo(5);
    expect(result.approved).toBe(true);
  });

  it("rejects invalid stop (stop on wrong side of entry)", () => {
    // BUY with stop above entry → invalid
    const result = calculatePositionSize(
      makeInput({ direction: "BUY", stopLevel: 105 }),
      TIGHT_RISK,
    );
    expect(result.approved).toBe(false);
    expect(result.rejectReason).toMatch(/invalid stop/i);
    expect(result.size).toBe(0);
  });

  it("enforces minimum deal size", () => {
    // Very tight stop → calculated size < minDealSize → clamp to min
    const result = calculatePositionSize(
      makeInput({ stopLevel: 99.99, minDealSize: 5 }),
      TIGHT_RISK,
    );
    expect(result.size).toBeGreaterThanOrEqual(5);
  });

  it("rejects when max open positions reached", () => {
    const result = calculatePositionSize(makeInput(), TIGHT_RISK, 5); // 5 open = max
    expect(result.approved).toBe(false);
    expect(result.rejectReason).toMatch(/max open positions/i);
  });

  it("rejects when daily loss limit reached", () => {
    // maxDailyLoss = 10,000 * 0.03 = 300
    const result = calculatePositionSize(makeInput(), TIGHT_RISK, 0, -300);
    expect(result.approved).toBe(false);
    expect(result.rejectReason).toMatch(/daily loss/i);
  });

  it("still returns size when daily loss is below limit", () => {
    const result = calculatePositionSize(makeInput(), TIGHT_RISK, 0, -299);
    expect(result.approved).toBe(true);
  });

  it("calculates risk/reward ratio correctly", () => {
    // stopDistance = 5, rewardDistance = 15 → R:R = 3.0
    const result = calculatePositionSize(makeInput(), TIGHT_RISK);
    expect(result.riskRewardRatio).toBeCloseTo(3.0);
    expect(result.passesRiskReward).toBe(true);
  });

  it("rejects when R:R ratio is below minimum (1.5)", () => {
    // limit = 107 → reward = 7, stop = 5 → R:R = 1.4 < 1.5
    const result = calculatePositionSize(
      makeInput({ limitLevel: 107 }),
      TIGHT_RISK,
    );
    expect(result.riskRewardRatio).toBeCloseTo(1.4);
    expect(result.passesRiskReward).toBe(false);
    expect(result.approved).toBe(false);
    expect(result.rejectReason).toMatch(/risk\/reward/i);
  });

  it("approves when limitLevel is null (no R:R check)", () => {
    const result = calculatePositionSize(
      makeInput({ limitLevel: null }),
      TIGHT_RISK,
    );
    expect(result.riskRewardRatio).toBeNull();
    expect(result.passesRiskReward).toBe(true);
    expect(result.approved).toBe(true);
  });

  it("scales size by valuePerPoint", () => {
    // valuePerPoint=2 → size = 100 / (5 * 2) = 10
    const result = calculatePositionSize(
      makeInput({ valuePerPoint: 2 }),
      TIGHT_RISK,
    );
    expect(result.size).toBe(10);
  });

  it("rounds size to 2 decimal places", () => {
    // stopDistance=3 → size = 100/3 ≈ 33.33...
    const result = calculatePositionSize(
      makeInput({ stopLevel: 97, limitLevel: 115 }),
      TIGHT_RISK,
    );
    const decimals = (result.size.toString().split(".")[1] ?? "").length;
    expect(decimals).toBeLessThanOrEqual(2);
  });
});

// ---------------------------------------------------------------------------
// calculateTrailingStop
// ---------------------------------------------------------------------------

describe("calculateTrailingStop", () => {
  it("returns null when not in profit", () => {
    expect(calculateTrailingStop("BUY", 100, 98, 95, 5)).toBeNull();
    expect(calculateTrailingStop("SELL", 100, 102, 105, 5)).toBeNull();
  });

  it("returns null when profit is less than 1x ATR", () => {
    // 0.5 ATR of profit → no adjustment
    expect(calculateTrailingStop("BUY", 100, 102.5, 95, 5)).toBeNull();
  });

  it("moves stop to break-even after 1x ATR profit (BUY)", () => {
    // ATR=5, profit=5 → move stop to entry (100)
    const newStop = calculateTrailingStop("BUY", 100, 105, 95, 5);
    expect(newStop).toBeCloseTo(100); // break-even
  });

  it("moves stop to break-even after 1x ATR profit (SELL)", () => {
    // entry=100, currentPrice=95 (5-point profit on SELL), currentStop=105, ATR=5
    const newStop = calculateTrailingStop("SELL", 100, 95, 105, 5);
    expect(newStop).toBeCloseTo(100); // break-even
  });

  it("trails at 1x ATR after 2x ATR profit (BUY)", () => {
    // ATR=5, profit=10 (2x ATR) → trail at currentPrice - ATR = 110 - 5 = 105
    const newStop = calculateTrailingStop("BUY", 100, 110, 95, 5);
    expect(newStop).toBeCloseTo(105);
  });

  it("trails at 1x ATR after 2x ATR profit (SELL)", () => {
    // entry=100, currentPrice=90 (2x ATR profit), ATR=5 → trail at 90 + 5 = 95
    const newStop = calculateTrailingStop("SELL", 100, 90, 105, 5);
    expect(newStop).toBeCloseTo(95);
  });

  it("does not move stop backwards (BUY trailing)", () => {
    // currentStop already at 108, would trail to 105 — should not regress
    const newStop = calculateTrailingStop("BUY", 100, 110, 108, 5);
    expect(newStop).toBeNull(); // 105 < 108, so no update
  });

  it("does not move stop backwards (SELL trailing)", () => {
    // currentStop already at 92, would trail to 95 — should not regress
    const newStop = calculateTrailingStop("SELL", 100, 90, 92, 5);
    expect(newStop).toBeNull(); // 95 > 92, so no update
  });

  it("does not move break-even stop if already at or above entry (BUY)", () => {
    // currentStop already at entry (100) → no adjustment
    const newStop = calculateTrailingStop("BUY", 100, 105, 100, 5);
    expect(newStop).toBeNull(); // already at break-even
  });

  it("does not move break-even stop if already at or below entry (SELL)", () => {
    const newStop = calculateTrailingStop("SELL", 100, 95, 100, 5);
    expect(newStop).toBeNull();
  });
});
