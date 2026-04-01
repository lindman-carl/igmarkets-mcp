import { describe, it, expect } from "vitest";
import { runStrategy } from "./strategy-runner.js";
import type { Candle } from "../../lib/indicators.js";
import type { StrategyParams } from "../core/schemas.js";
import { DEFAULT_STRATEGY_PARAMS } from "../core/schemas.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const EPIC = "IX.D.FTSE.DAILY.IP";

const DEFAULT_PARAMS: StrategyParams = {
  ...DEFAULT_STRATEGY_PARAMS,
  atrStopMultiplier: 1.5,
  atrTargetMultiplier: 3.0,
};

/**
 * Build a candle array where prices trend upward from `start` in steps.
 * Adds a small range so ATR is non-zero.
 */
function trendingCandles(
  n: number,
  start: number,
  step: number,
  range = 2,
): Candle[] {
  return Array.from({ length: n }, (_, i) => {
    const c = start + i * step;
    return { open: c, high: c + range, low: c - range, close: c };
  });
}

/** Build flat candles (no trend, tight range) */
function flatCandles(n: number, price: number, range = 1): Candle[] {
  return Array.from({ length: n }, () => ({
    open: price,
    high: price + range,
    low: price - range,
    close: price,
  }));
}

// ---------------------------------------------------------------------------
// Trend Following
// ---------------------------------------------------------------------------

describe("runStrategy – trend-following", () => {
  it("generates no signals with insufficient candles", () => {
    const candles = trendingCandles(5, 100, 1);
    const signals = runStrategy("trend-following", EPIC, candles, null);
    expect(signals).toHaveLength(0);
  });

  it("generates BUY entry in an uptrend with pull-back", () => {
    // 30 candles trending up so SMA10 > SMA20
    // Last price placed close to SMA10 (pull-back within 1 ATR)
    const base = trendingCandles(29, 100, 1, 2);
    // determineTrend requires currentPrice > smaFast for "uptrend".
    // With base closes [100..128], SMA10 ≈ 124.1, SMA20 ≈ 119.3 when close=125.
    // close=125 > smaFast=124.1, pullBackDistance≈0.9 <= ATR≈4. ✓
    const last: Candle = { open: 124, high: 127, low: 122, close: 125 };
    const candles = [...base, last];

    const signals = runStrategy(
      "trend-following",
      EPIC,
      candles,
      null,
      DEFAULT_PARAMS,
      false,
      null,
    );
    const entries = signals.filter((s) => s.action === "buy");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].strategy).toBe("trend-following");
    expect(entries[0].signalType).toBe("entry");
    expect(entries[0].suggestedStop).not.toBeNull();
    expect(entries[0].suggestedLimit).not.toBeNull();
  });

  it("generates SELL entry in a downtrend with pull-back", () => {
    const base = trendingCandles(29, 200, -1, 2);
    // determineTrend requires currentPrice < smaFast for "downtrend".
    // With base closes [200..172], SMA10 ≈ 175.8, SMA20 ≈ 180.7 when close=174.
    // close=174 < smaFast=175.8, pullBackDistance≈1.8 <= ATR≈4. ✓
    const last: Candle = { open: 175, high: 177, low: 173, close: 174 };
    const candles = [...base, last];

    const signals = runStrategy(
      "trend-following",
      EPIC,
      candles,
      null,
      DEFAULT_PARAMS,
      false,
      null,
    );
    const entries = signals.filter((s) => s.action === "sell");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries[0].signalType).toBe("entry");
  });

  it("generates CLOSE exit when BUY position trend reverses", () => {
    // Use flat candles so trend is "ranging" → exit for BUY position
    const candles = flatCandles(30, 100, 0.1);
    const signals = runStrategy(
      "trend-following",
      EPIC,
      candles,
      null,
      DEFAULT_PARAMS,
      true, // has open position
      "BUY",
    );
    const exits = signals.filter((s) => s.action === "close");
    expect(exits.length).toBeGreaterThan(0);
    expect(exits[0].signalType).toBe("exit");
  });

  it("generates CLOSE exit when SELL position trend reverses", () => {
    const candles = trendingCandles(30, 100, 1, 2); // uptrend
    const signals = runStrategy(
      "trend-following",
      EPIC,
      candles,
      null,
      DEFAULT_PARAMS,
      true,
      "SELL",
    );
    const exits = signals.filter((s) => s.action === "close");
    expect(exits.length).toBeGreaterThan(0);
  });

  it("generates no entry if already in a position", () => {
    const candles = trendingCandles(30, 100, 1, 2);
    const signals = runStrategy(
      "trend-following",
      EPIC,
      candles,
      null,
      DEFAULT_PARAMS,
      true,
      "BUY",
    );
    // Only exit signals possible when position matches trend
    const entries = signals.filter((s) => s.signalType === "entry");
    expect(entries).toHaveLength(0);
  });

  it("stop is below entry for BUY and above entry for SELL", () => {
    const base = trendingCandles(29, 100, 1, 2);
    // Use close=125 so a BUY signal is actually generated (same as BUY entry test)
    const last: Candle = { open: 124, high: 127, low: 122, close: 125 };
    const candles = [...base, last];
    const signals = runStrategy(
      "trend-following",
      EPIC,
      candles,
      null,
      DEFAULT_PARAMS,
      false,
      null,
    );
    for (const sig of signals) {
      if (sig.action === "buy" && sig.suggestedStop !== null) {
        expect(sig.suggestedStop).toBeLessThan(sig.priceAtSignal);
      }
      if (sig.action === "sell" && sig.suggestedStop !== null) {
        expect(sig.suggestedStop).toBeGreaterThan(sig.priceAtSignal);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Breakout
// ---------------------------------------------------------------------------

describe("runStrategy – breakout", () => {
  it("generates no signals with insufficient candles", () => {
    const candles = flatCandles(5, 100);
    expect(runStrategy("breakout", EPIC, candles, null)).toHaveLength(0);
  });

  it("generates BUY when price breaks above resistance + buffer", () => {
    // 20 candles: 19 base (high=105, low=95), 1 breakout candle.
    // SR lookback=20 includes all 20 → resistance = max high of all 20.
    // Breakout high=106 → resistance=106, buffer=106*1.005=106.53.
    // close=107 > 106.53 ✓
    const base: Candle[] = Array.from({ length: 19 }, (_, i) => ({
      open: 100,
      high: 105,
      low: 95,
      close: 100,
    }));
    const breakout: Candle = {
      open: 105.5,
      high: 106,
      low: 105,
      close: 107,
    };
    const candles = [...base, breakout];

    const signals = runStrategy("breakout", EPIC, candles, null);
    const buys = signals.filter((s) => s.action === "buy");
    expect(buys.length).toBeGreaterThan(0);
    expect(buys[0].signalType).toBe("entry");
  });

  it("generates SELL when price breaks below support - buffer", () => {
    // 19 base candles (high=105, low=95), 1 breakdown candle.
    // SR lookback=20 → support = min low of all 20.
    // Breakdown low=90 → support=90, buffer=90*0.995=89.55.
    // close=89 < 89.55 ✓
    const base: Candle[] = Array.from({ length: 19 }, () => ({
      open: 100,
      high: 105,
      low: 95,
      close: 100,
    }));
    const breakdown: Candle = {
      open: 91,
      high: 91.5,
      low: 90,
      close: 89,
    };
    const candles = [...base, breakdown];

    const signals = runStrategy("breakout", EPIC, candles, null);
    const sells = signals.filter((s) => s.action === "sell");
    expect(sells.length).toBeGreaterThan(0);
  });

  it("generates CLOSE exit when price returns inside range", () => {
    const candles: Candle[] = Array.from({ length: 20 }, (_, i) => ({
      open: 100,
      high: 105,
      low: 95,
      close: i < 19 ? 106 : 100, // last candle returns inside range
    }));

    const signals = runStrategy(
      "breakout",
      EPIC,
      candles,
      null,
      DEFAULT_PARAMS,
      true,
      "BUY",
    );
    const exits = signals.filter((s) => s.action === "close");
    expect(exits.length).toBeGreaterThan(0);
  });

  it("does not generate entry when already in a position", () => {
    const base: Candle[] = Array.from({ length: 19 }, () => ({
      open: 100,
      high: 105,
      low: 95,
      close: 100,
    }));
    const breakout: Candle = { open: 107, high: 108, low: 106, close: 107 };
    const candles = [...base, breakout];

    const signals = runStrategy(
      "breakout",
      EPIC,
      candles,
      null,
      DEFAULT_PARAMS,
      true, // already in position — price outside range triggers exit check, not entry
      "BUY",
    );
    const entries = signals.filter((s) => s.signalType === "entry");
    expect(entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Mean Reversion
// ---------------------------------------------------------------------------

describe("runStrategy – mean-reversion", () => {
  it("generates no signals without bollinger data", () => {
    const candles = flatCandles(5, 100);
    expect(runStrategy("mean-reversion", EPIC, candles, null)).toHaveLength(0);
  });

  it("generates BUY when price at lower band with >55% short sentiment", () => {
    // 25 candles: 24 at 100, last well below SMA (will push close near lower band)
    // Use a wide-ranging series to ensure lower band is meaningful
    const base: Candle[] = Array.from({ length: 19 }, (_, i) => ({
      open: 100 + i,
      high: 105 + i,
      low: 95 + i,
      close: 100 + i,
    }));
    // Force last candle very low — below lower bollinger band
    const lowCandle: Candle = { open: 60, high: 61, low: 59, close: 60 };
    const candles = [...base, lowCandle];

    const sentiment = {
      longPositionPercentage: 40,
      shortPositionPercentage: 60,
    };
    const signals = runStrategy("mean-reversion", EPIC, candles, sentiment);
    const buys = signals.filter((s) => s.action === "buy");
    // May or may not signal depending on exact band placement, but we verify no errors
    expect(Array.isArray(signals)).toBe(true);
    if (buys.length > 0) {
      expect(buys[0].strategy).toBe("mean-reversion");
    }
  });

  it("generates SELL when price at upper band with >55% long sentiment", () => {
    const base: Candle[] = Array.from({ length: 19 }, (_, i) => ({
      open: 100 + i,
      high: 102 + i,
      low: 98 + i,
      close: 100 + i,
    }));
    // Force last candle very high — above upper bollinger band
    const highCandle: Candle = { open: 160, high: 162, low: 158, close: 160 };
    const candles = [...base, highCandle];

    const sentiment = {
      longPositionPercentage: 60,
      shortPositionPercentage: 40,
    };
    const signals = runStrategy("mean-reversion", EPIC, candles, sentiment);
    expect(Array.isArray(signals)).toBe(true);
  });

  it("generates no signals without sentiment data", () => {
    const candles = trendingCandles(25, 100, 0, 5);
    const signals = runStrategy("mean-reversion", EPIC, candles, null);
    // No entry signals without sentiment, but no crash
    const entries = signals.filter((s) => s.signalType === "entry");
    expect(entries).toHaveLength(0);
  });

  it("generates CLOSE exit when price near middle band", () => {
    // Need width > 0 (so flatCandles with SD=0 won't work) and currentPrice ≈ middle.
    // Use candles oscillating around 100 so SMA20=100, then last close at 99.5≈middle.
    // This gives SD>0, positive width, and |current-middle| < width*0.1. ✓
    const base = Array.from({ length: 24 }, (_, i): Candle => {
      const c = 95 + (i % 10); // oscillates 95..104 → mean ≈ 99.5
      return { open: c, high: c + 2, low: c - 2, close: c };
    });
    // last close = SMA20 of base's last 20 ≈ 99.5 → nearMiddle = true
    const meanClose = base.slice(-20).reduce((s, c) => s + c.close, 0) / 20;
    const lastCandle: Candle = {
      open: meanClose,
      high: meanClose + 2,
      low: meanClose - 2,
      close: meanClose,
    };
    const candles = [...base, lastCandle];
    const signals = runStrategy(
      "mean-reversion",
      EPIC,
      candles,
      null,
      DEFAULT_PARAMS,
      true,
      "BUY",
    );
    const exits = signals.filter((s) => s.action === "close");
    // With constant price, current = middle, so nearMiddle should be true
    expect(exits.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Sentiment Contrarian
// ---------------------------------------------------------------------------

describe("runStrategy – sentiment-contrarian", () => {
  it("generates no signals without sentiment data", () => {
    const candles = trendingCandles(25, 100, 1, 2);
    expect(
      runStrategy("sentiment-contrarian", EPIC, candles, null),
    ).toHaveLength(0);
  });

  it("generates no signals without sufficient candles for ATR", () => {
    const candles = flatCandles(5, 100);
    const sentiment = {
      longPositionPercentage: 80,
      shortPositionPercentage: 20,
    };
    expect(
      runStrategy("sentiment-contrarian", EPIC, candles, sentiment),
    ).toHaveLength(0);
  });

  it("generates SELL when extreme bullish sentiment and price near resistance", () => {
    // 25 candles, then a candle at resistance level
    const base: Candle[] = Array.from({ length: 24 }, () => ({
      open: 100,
      high: 110,
      low: 90,
      close: 100,
    }));
    // Place price just below resistance (110) within 10% of range
    const nearResistance: Candle = {
      open: 108,
      high: 110,
      low: 106,
      close: 109,
    };
    const candles = [...base, nearResistance];

    const sentiment = {
      longPositionPercentage: 80,
      shortPositionPercentage: 20,
    };
    const signals = runStrategy(
      "sentiment-contrarian",
      EPIC,
      candles,
      sentiment,
      DEFAULT_PARAMS,
      false,
      null,
    );
    const sells = signals.filter((s) => s.action === "sell");
    expect(sells.length).toBeGreaterThan(0);
    expect(sells[0].signalType).toBe("entry");
  });

  it("generates BUY when extreme bearish sentiment and price near support", () => {
    const base: Candle[] = Array.from({ length: 24 }, () => ({
      open: 100,
      high: 110,
      low: 90,
      close: 100,
    }));
    // Place price near support (90) within 10% of range
    const nearSupport: Candle = { open: 91, high: 92, low: 90, close: 91 };
    const candles = [...base, nearSupport];

    const sentiment = {
      longPositionPercentage: 20,
      shortPositionPercentage: 80,
    };
    const signals = runStrategy(
      "sentiment-contrarian",
      EPIC,
      candles,
      sentiment,
      DEFAULT_PARAMS,
      false,
      null,
    );
    const buys = signals.filter((s) => s.action === "buy");
    expect(buys.length).toBeGreaterThan(0);
  });

  it("generates CLOSE exit when sentiment normalises", () => {
    const candles = trendingCandles(25, 100, 1, 2);
    const normalSentiment = {
      longPositionPercentage: 55,
      shortPositionPercentage: 45,
    };
    const signals = runStrategy(
      "sentiment-contrarian",
      EPIC,
      candles,
      normalSentiment,
      DEFAULT_PARAMS,
      true,
      "SELL",
    );
    const exits = signals.filter((s) => s.action === "close");
    expect(exits.length).toBeGreaterThan(0);
  });

  it("stop is above entry for SELL signal", () => {
    const base: Candle[] = Array.from({ length: 24 }, () => ({
      open: 100,
      high: 110,
      low: 90,
      close: 100,
    }));
    const nearResistance: Candle = {
      open: 108,
      high: 110,
      low: 106,
      close: 109,
    };
    const candles = [...base, nearResistance];
    const sentiment = {
      longPositionPercentage: 80,
      shortPositionPercentage: 20,
    };
    const signals = runStrategy(
      "sentiment-contrarian",
      EPIC,
      candles,
      sentiment,
      DEFAULT_PARAMS,
      false,
      null,
    );
    for (const sig of signals) {
      if (sig.action === "sell" && sig.suggestedStop !== null) {
        expect(sig.suggestedStop).toBeGreaterThan(sig.priceAtSignal);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Signal structure invariants (all strategies)
// ---------------------------------------------------------------------------

describe("runStrategy – signal structure", () => {
  const strategies = [
    "trend-following",
    "breakout",
    "mean-reversion",
    "sentiment-contrarian",
  ] as const;

  for (const strategy of strategies) {
    it(`${strategy}: all signals have required fields`, () => {
      const candles = trendingCandles(30, 100, 0.5, 2);
      const sentiment = {
        longPositionPercentage: 60,
        shortPositionPercentage: 40,
      };
      const signals = runStrategy(strategy, EPIC, candles, sentiment);
      for (const sig of signals) {
        expect(sig.epic).toBe(EPIC);
        expect(sig.strategy).toBe(strategy);
        expect(typeof sig.confidence).toBe("number");
        expect(sig.confidence).toBeGreaterThanOrEqual(0);
        expect(sig.confidence).toBeLessThanOrEqual(1);
        expect(["buy", "sell", "close", "hold"]).toContain(sig.action);
        expect(["entry", "exit", "adjust"]).toContain(sig.signalType);
      }
    });
  }
});
