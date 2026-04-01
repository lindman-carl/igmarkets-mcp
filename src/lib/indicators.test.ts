import { describe, it, expect } from "vitest";
import {
  sma,
  smaSeries,
  trueRange,
  trueRangeSeries,
  atr,
  atrSeries,
  standardDeviation,
  bollingerBands,
  supportResistance,
  volatilityPct,
  calculateIndicators,
  determineTrend,
  extractCloses,
  type Candle,
} from "./indicators.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a flat candle array where open=close=high=low=value */
function flatCandles(values: number[]): Candle[] {
  return values.map((v) => ({ open: v, high: v, low: v, close: v }));
}

/** Build candles from close prices with a fixed range of `range` on each side */
function candlesWithRange(closes: number[], range = 1): Candle[] {
  return closes.map((c) => ({
    open: c,
    high: c + range,
    low: c - range,
    close: c,
  }));
}

// ---------------------------------------------------------------------------
// sma
// ---------------------------------------------------------------------------

describe("sma", () => {
  it("returns null for empty array", () => {
    expect(sma([], 3)).toBeNull();
  });

  it("returns null when period is 0", () => {
    expect(sma([1, 2, 3], 0)).toBeNull();
  });

  it("returns null when array is shorter than period", () => {
    expect(sma([1, 2], 3)).toBeNull();
  });

  it("calculates correctly for exact-length input", () => {
    expect(sma([1, 2, 3], 3)).toBeCloseTo(2.0);
  });

  it("uses only the last `period` values", () => {
    // SMA(3) of [1,2,3,4,5] = (3+4+5)/3 = 4
    expect(sma([1, 2, 3, 4, 5], 3)).toBeCloseTo(4.0);
  });

  it("returns value for period=1 (last value)", () => {
    expect(sma([10, 20, 30], 1)).toBeCloseTo(30);
  });
});

// ---------------------------------------------------------------------------
// smaSeries
// ---------------------------------------------------------------------------

describe("smaSeries", () => {
  it("returns all nulls when input is shorter than period", () => {
    expect(smaSeries([1, 2], 3)).toEqual([null, null]);
  });

  it("fills nulls for early entries and values for the rest", () => {
    const result = smaSeries([1, 2, 3, 4, 5], 3);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(2.0); // (1+2+3)/3
    expect(result[3]).toBeCloseTo(3.0); // (2+3+4)/3
    expect(result[4]).toBeCloseTo(4.0); // (3+4+5)/3
  });

  it("returns same length as input", () => {
    const vals = [10, 20, 30, 40, 50];
    expect(smaSeries(vals, 2)).toHaveLength(vals.length);
  });
});

// ---------------------------------------------------------------------------
// trueRange
// ---------------------------------------------------------------------------

describe("trueRange", () => {
  it("uses high-low when it is the largest component", () => {
    const candle: Candle = { open: 10, high: 15, low: 10, close: 12 };
    // TR = max(15-10, |15-12|, |10-12|) = max(5, 3, 2) = 5
    expect(trueRange(candle, 12)).toBeCloseTo(5);
  });

  it("uses |high - prevClose| when gap up", () => {
    const candle: Candle = { open: 20, high: 22, low: 19, close: 21 };
    // prevClose=10, TR = max(22-19, |22-10|, |19-10|) = max(3, 12, 9) = 12
    expect(trueRange(candle, 10)).toBeCloseTo(12);
  });

  it("uses |low - prevClose| when gap down", () => {
    const candle: Candle = { open: 8, high: 9, low: 7, close: 8 };
    // prevClose=15, TR = max(9-7, |9-15|, |7-15|) = max(2, 6, 8) = 8
    expect(trueRange(candle, 15)).toBeCloseTo(8);
  });
});

// ---------------------------------------------------------------------------
// trueRangeSeries
// ---------------------------------------------------------------------------

describe("trueRangeSeries", () => {
  it("returns empty array for empty input", () => {
    expect(trueRangeSeries([])).toEqual([]);
  });

  it("first entry uses high-low (no prev close)", () => {
    const candles = candlesWithRange([100], 5);
    expect(trueRangeSeries(candles)[0]).toBeCloseTo(10); // high-low = 10
  });

  it("same length as input", () => {
    const candles = candlesWithRange([100, 101, 102], 1);
    expect(trueRangeSeries(candles)).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// atr
// ---------------------------------------------------------------------------

describe("atr", () => {
  it("returns null when candles fewer than period+1", () => {
    const candles = candlesWithRange([100, 101, 102], 1);
    expect(atr(candles, 14)).toBeNull();
  });

  it("returns a number for sufficient data", () => {
    // 16 candles, range=2 each → TR = 4 (high-low for first, then 4 for rest)
    const candles = candlesWithRange(
      Array.from({ length: 16 }, (_, i) => 100 + i),
      2,
    );
    const result = atr(candles, 14);
    expect(result).not.toBeNull();
    expect(result).toBeGreaterThan(0);
  });

  it("is consistent with a known dataset", () => {
    // Flat candles: range=2, all closes=100. TR for first = 4; TR for rest ≈ 4 (gaps=0)
    const candles = candlesWithRange(new Array(16).fill(100), 2);
    const result = atr(candles, 14);
    expect(result).toBeCloseTo(4);
  });
});

// ---------------------------------------------------------------------------
// atrSeries
// ---------------------------------------------------------------------------

describe("atrSeries", () => {
  it("returns same length as input", () => {
    const candles = candlesWithRange(new Array(20).fill(100), 1);
    expect(atrSeries(candles, 14)).toHaveLength(20);
  });

  it("first period-1 entries are null", () => {
    const candles = candlesWithRange(new Array(20).fill(100), 1);
    const series = atrSeries(candles, 14);
    for (let i = 0; i < 13; i++) {
      expect(series[i]).toBeNull();
    }
    expect(series[13]).not.toBeNull();
  });
});

// ---------------------------------------------------------------------------
// standardDeviation
// ---------------------------------------------------------------------------

describe("standardDeviation", () => {
  it("returns null for insufficient data", () => {
    expect(standardDeviation([1, 2], 3)).toBeNull();
  });

  it("returns 0 for constant series", () => {
    expect(standardDeviation([5, 5, 5, 5], 4)).toBeCloseTo(0);
  });

  it("calculates population SD correctly", () => {
    // Mean of [2,4,4,4,5,5,7,9] = 5, population SD = 2
    const vals = [2, 4, 4, 4, 5, 5, 7, 9];
    expect(standardDeviation(vals, vals.length)).toBeCloseTo(2.0);
  });
});

// ---------------------------------------------------------------------------
// bollingerBands
// ---------------------------------------------------------------------------

describe("bollingerBands", () => {
  it("returns null for insufficient data", () => {
    expect(bollingerBands([1, 2, 3], 20)).toBeNull();
  });

  it("middle band equals SMA", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const bb = bollingerBands(closes, 20);
    const expectedMiddle = sma(closes, 20)!;
    expect(bb!.middle).toBeCloseTo(expectedMiddle);
  });

  it("upper > middle > lower", () => {
    const closes = Array.from({ length: 25 }, (_, i) => 100 + Math.sin(i) * 5);
    const bb = bollingerBands(closes, 20);
    expect(bb).not.toBeNull();
    expect(bb!.upper).toBeGreaterThan(bb!.middle);
    expect(bb!.middle).toBeGreaterThan(bb!.lower);
  });

  it("width equals upper - lower", () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const bb = bollingerBands(closes, 20)!;
    expect(bb.width).toBeCloseTo(bb.upper - bb.lower);
  });

  it("upper = lower for constant prices (SD=0)", () => {
    const closes = new Array(20).fill(100);
    const bb = bollingerBands(closes, 20)!;
    expect(bb.upper).toBeCloseTo(100);
    expect(bb.lower).toBeCloseTo(100);
    expect(bb.width).toBeCloseTo(0);
  });
});

// ---------------------------------------------------------------------------
// supportResistance
// ---------------------------------------------------------------------------

describe("supportResistance", () => {
  it("returns null for insufficient data", () => {
    const candles = flatCandles([100, 101]);
    expect(supportResistance(candles, 20)).toBeNull();
  });

  it("returns null for lookback=0", () => {
    const candles = flatCandles(new Array(20).fill(100));
    expect(supportResistance(candles, 0)).toBeNull();
  });

  it("identifies correct support and resistance", () => {
    const candles: Candle[] = [
      { open: 100, high: 110, low: 90, close: 100 },
      { open: 95, high: 105, low: 80, close: 95 },
      { open: 100, high: 120, low: 95, close: 110 },
    ];
    const sr = supportResistance(candles, 3)!;
    expect(sr.support).toBeCloseTo(80);
    expect(sr.resistance).toBeCloseTo(120);
    expect(sr.rangeWidth).toBeCloseTo(40);
  });

  it("uses only the last `lookback` candles", () => {
    // First candle has extreme values but lookback=2 should ignore it
    const candles: Candle[] = [
      { open: 1, high: 999, low: 1, close: 1 }, // ignored
      { open: 100, high: 105, low: 95, close: 100 },
      { open: 100, high: 102, low: 98, close: 100 },
    ];
    const sr = supportResistance(candles, 2)!;
    expect(sr.resistance).toBeCloseTo(105);
    expect(sr.support).toBeCloseTo(95);
  });
});

// ---------------------------------------------------------------------------
// volatilityPct
// ---------------------------------------------------------------------------

describe("volatilityPct", () => {
  it("returns null for insufficient data", () => {
    const candles = flatCandles([100]);
    expect(volatilityPct(candles, 14)).toBeNull();
  });

  it("returns null for period=0", () => {
    const candles = flatCandles(new Array(20).fill(100));
    expect(volatilityPct(candles, 0)).toBeNull();
  });

  it("calculates correctly for known data", () => {
    // 14 candles, each with high=101, low=99, close=100 → range=2 each → avg=2 → 2/100*100 = 2%
    const candles = candlesWithRange(new Array(14).fill(100), 1);
    expect(volatilityPct(candles, 14)).toBeCloseTo(2.0);
  });

  it("returns null when currentPrice is 0", () => {
    const candles = flatCandles(new Array(14).fill(0));
    expect(volatilityPct(candles, 14)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// determineTrend
// ---------------------------------------------------------------------------

describe("determineTrend", () => {
  it("returns uptrend when smaFast > smaSlow and price > smaFast", () => {
    expect(determineTrend(110, 105, 100)).toBe("uptrend");
  });

  it("returns downtrend when smaFast < smaSlow and price < smaFast", () => {
    expect(determineTrend(90, 95, 100)).toBe("downtrend");
  });

  it("returns ranging when SMAs are too close together", () => {
    // smaDiffPct = |100.1 - 100| / 100 * 100 = 0.1% < default threshold 0.5%
    expect(determineTrend(100, 100.1, 100)).toBe("ranging");
  });

  it("returns ranging when smaFast > smaSlow but price <= smaFast", () => {
    expect(determineTrend(104, 105, 100, 0)).toBe("ranging");
  });

  it("returns ranging when smaFast < smaSlow but price >= smaFast", () => {
    expect(determineTrend(96, 95, 100, 0)).toBe("ranging");
  });

  it("respects custom threshold", () => {
    // 1% difference should be ranging with threshold=2
    expect(determineTrend(101, 101, 100, 2)).toBe("ranging");
    // but uptrend with threshold=0.5
    expect(determineTrend(110, 106, 100, 0.5)).toBe("uptrend");
  });
});

// ---------------------------------------------------------------------------
// extractCloses
// ---------------------------------------------------------------------------

describe("extractCloses", () => {
  it("extracts close prices from candles", () => {
    const candles = candlesWithRange([10, 20, 30], 1);
    expect(extractCloses(candles)).toEqual([10, 20, 30]);
  });

  it("returns empty array for empty input", () => {
    expect(extractCloses([])).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// calculateIndicators (composite)
// ---------------------------------------------------------------------------

describe("calculateIndicators", () => {
  const makeCandles = (n: number): Candle[] =>
    Array.from({ length: n }, (_, i) => ({
      open: 100 + i,
      high: 102 + i,
      low: 99 + i,
      close: 100 + i,
    }));

  it("returns nulls when candles are insufficient", () => {
    const snapshot = calculateIndicators(makeCandles(5));
    expect(snapshot.smaFast).toBeNull();
    expect(snapshot.smaSlow).toBeNull();
    expect(snapshot.atr).toBeNull();
    expect(snapshot.bollinger).toBeNull();
  });

  it("populates all indicators with 30 candles", () => {
    const snapshot = calculateIndicators(makeCandles(30));
    expect(snapshot.smaFast).not.toBeNull();
    expect(snapshot.smaSlow).not.toBeNull();
    expect(snapshot.atr).not.toBeNull();
    expect(snapshot.bollinger).not.toBeNull();
    expect(snapshot.supportResistance).not.toBeNull();
    expect(snapshot.volatilityPct).not.toBeNull();
  });

  it("currentPrice reflects last candle's close", () => {
    const candles = makeCandles(30);
    const snapshot = calculateIndicators(candles);
    expect(snapshot.currentPrice).toBe(candles[candles.length - 1].close);
  });

  it("dayHigh and dayLow reflect last candle", () => {
    const candles = makeCandles(30);
    const last = candles[candles.length - 1];
    const snapshot = calculateIndicators(candles);
    expect(snapshot.dayHigh).toBe(last.high);
    expect(snapshot.dayLow).toBe(last.low);
  });

  it("respects custom params", () => {
    const candles = makeCandles(30);
    const snapshot = calculateIndicators(candles, {
      smaPeriodFast: 5,
      smaPeriodSlow: 10,
    });
    // smaFast(5) should differ from smaFast(10)
    const snapshotDefault = calculateIndicators(candles);
    expect(snapshot.smaFast).not.toBe(snapshotDefault.smaFast);
  });
});
