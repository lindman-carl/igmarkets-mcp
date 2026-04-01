/**
 * Technical Indicators Library
 *
 * Pure functions for calculating technical indicators from OHLC price data.
 * All functions are stateless — pass in the data, get the result.
 *
 * Indicators implemented:
 * - SMA (Simple Moving Average)
 * - ATR (Average True Range)
 * - Bollinger Bands (SMA ± 2 standard deviations)
 * - Support / Resistance (N-period high/low)
 * - Volatility % (average daily range as % of price)
 *
 * Input convention: arrays are ordered oldest-first (index 0 = oldest).
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single OHLC candle. */
export interface Candle {
  open: number;
  high: number;
  low: number;
  close: number;
}

/** Bollinger Bands result for a single point. */
export interface BollingerBands {
  upper: number;
  middle: number;
  lower: number;
  /** Band width as absolute value (upper - lower) */
  width: number;
}

/** Support and resistance levels. */
export interface SupportResistance {
  support: number;
  resistance: number;
  /** Width of the range (resistance - support) */
  rangeWidth: number;
}

/** Full indicator snapshot for a single instrument at a point in time. */
export interface IndicatorSnapshot {
  smaFast: number | null;
  smaSlow: number | null;
  atr: number | null;
  bollinger: BollingerBands | null;
  supportResistance: SupportResistance | null;
  volatilityPct: number | null;
  currentPrice: number;
  dayHigh: number;
  dayLow: number;
}

// ---------------------------------------------------------------------------
// Simple Moving Average (SMA)
// ---------------------------------------------------------------------------

/**
 * Calculate the Simple Moving Average over the last `period` values.
 *
 * @param values - Array of numbers (oldest first)
 * @param period - Number of periods to average
 * @returns The SMA value, or null if insufficient data
 */
export function sma(values: number[], period: number): number | null {
  if (values.length < period || period <= 0) return null;

  let sum = 0;
  for (let i = values.length - period; i < values.length; i++) {
    sum += values[i];
  }
  return sum / period;
}

/**
 * Calculate a rolling SMA series for the full array.
 *
 * @param values - Array of numbers (oldest first)
 * @param period - Number of periods to average
 * @returns Array of SMA values (null where insufficient data), same length as input
 */
export function smaSeries(values: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return result;

  // Initial window sum
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += values[i];
  }
  result[period - 1] = sum / period;

  // Slide the window
  for (let i = period; i < values.length; i++) {
    sum += values[i] - values[i - period];
    result[i] = sum / period;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Average True Range (ATR)
// ---------------------------------------------------------------------------

/**
 * Calculate the True Range for a single candle.
 *
 * TR = max(high - low, |high - prevClose|, |low - prevClose|)
 *
 * @param candle - Current candle
 * @param prevClose - Previous candle's close price
 * @returns True Range value
 */
export function trueRange(candle: Candle, prevClose: number): number {
  return Math.max(
    candle.high - candle.low,
    Math.abs(candle.high - prevClose),
    Math.abs(candle.low - prevClose),
  );
}

/**
 * Calculate True Range series for an array of candles.
 * The first candle uses (high - low) since there is no previous close.
 *
 * @param candles - Array of OHLC candles (oldest first)
 * @returns Array of True Range values, same length as input
 */
export function trueRangeSeries(candles: Candle[]): number[] {
  if (candles.length === 0) return [];

  const result: number[] = [candles[0].high - candles[0].low];
  for (let i = 1; i < candles.length; i++) {
    result.push(trueRange(candles[i], candles[i - 1].close));
  }
  return result;
}

/**
 * Calculate the Average True Range (ATR) over the last `period` candles.
 *
 * @param candles - Array of OHLC candles (oldest first)
 * @param period - Number of periods (default: 14)
 * @returns ATR value, or null if insufficient data
 */
export function atr(candles: Candle[], period = 14): number | null {
  // Need at least period + 1 candles (period TRs need period candles + 1 prev close)
  if (candles.length < period + 1) return null;

  const trSeries = trueRangeSeries(candles);
  return sma(trSeries, period);
}

/**
 * Calculate a rolling ATR series.
 *
 * @param candles - Array of OHLC candles (oldest first)
 * @param period - Number of periods (default: 14)
 * @returns Array of ATR values (null where insufficient data), same length as input
 */
export function atrSeries(candles: Candle[], period = 14): (number | null)[] {
  const trSeries = trueRangeSeries(candles);
  return smaSeries(trSeries, period);
}

// ---------------------------------------------------------------------------
// Standard Deviation
// ---------------------------------------------------------------------------

/**
 * Calculate the population standard deviation of the last `period` values.
 *
 * @param values - Array of numbers (oldest first)
 * @param period - Number of periods
 * @returns Standard deviation, or null if insufficient data
 */
export function standardDeviation(
  values: number[],
  period: number,
): number | null {
  if (values.length < period || period <= 0) return null;

  const mean = sma(values, period)!;
  let sumSqDiff = 0;
  for (let i = values.length - period; i < values.length; i++) {
    const diff = values[i] - mean;
    sumSqDiff += diff * diff;
  }
  return Math.sqrt(sumSqDiff / period);
}

// ---------------------------------------------------------------------------
// Bollinger Bands
// ---------------------------------------------------------------------------

/**
 * Calculate Bollinger Bands for the latest data point.
 *
 * - Middle = SMA(period)
 * - Upper  = SMA(period) + multiplier * SD(period)
 * - Lower  = SMA(period) - multiplier * SD(period)
 *
 * @param closes - Array of closing prices (oldest first)
 * @param period - SMA / SD period (default: 20)
 * @param multiplier - Standard deviation multiplier (default: 2)
 * @returns BollingerBands or null if insufficient data
 */
export function bollingerBands(
  closes: number[],
  period = 20,
  multiplier = 2,
): BollingerBands | null {
  const middle = sma(closes, period);
  const sd = standardDeviation(closes, period);
  if (middle === null || sd === null) return null;

  const upper = middle + multiplier * sd;
  const lower = middle - multiplier * sd;
  return {
    upper,
    middle,
    lower,
    width: upper - lower,
  };
}

// ---------------------------------------------------------------------------
// Support & Resistance
// ---------------------------------------------------------------------------

/**
 * Identify support and resistance as the lowest low and highest high
 * over the last `lookback` candles.
 *
 * @param candles - Array of OHLC candles (oldest first)
 * @param lookback - Number of candles to scan (default: 20)
 * @returns SupportResistance or null if insufficient data
 */
export function supportResistance(
  candles: Candle[],
  lookback = 20,
): SupportResistance | null {
  if (candles.length < lookback || lookback <= 0) return null;

  const slice = candles.slice(-lookback);
  let support = Infinity;
  let resistance = -Infinity;

  for (const c of slice) {
    if (c.low < support) support = c.low;
    if (c.high > resistance) resistance = c.high;
  }

  return {
    support,
    resistance,
    rangeWidth: resistance - support,
  };
}

// ---------------------------------------------------------------------------
// Volatility
// ---------------------------------------------------------------------------

/**
 * Calculate average daily range as a percentage of the current price.
 *
 * volatility% = (average(high - low) / currentPrice) * 100
 *
 * @param candles - Array of OHLC candles (oldest first)
 * @param period - Number of candles to average (default: 14)
 * @returns Volatility percentage, or null if insufficient data
 */
export function volatilityPct(candles: Candle[], period = 14): number | null {
  if (candles.length < period || period <= 0) return null;

  const slice = candles.slice(-period);
  let sumRange = 0;
  for (const c of slice) {
    sumRange += c.high - c.low;
  }
  const avgRange = sumRange / period;
  const currentPrice = candles[candles.length - 1].close;

  if (currentPrice === 0) return null;
  return (avgRange / currentPrice) * 100;
}

// ---------------------------------------------------------------------------
// Composite: Full Indicator Snapshot
// ---------------------------------------------------------------------------

/**
 * Calculate all indicators for an instrument given its OHLC history.
 *
 * This is the main entry point for the strategy runner. Pass in daily candles
 * and get back a full snapshot of all indicator values.
 *
 * @param candles - Array of OHLC candles (oldest first), at least 21 recommended
 * @param params - Indicator parameters
 * @returns IndicatorSnapshot with all calculated values
 */
export function calculateIndicators(
  candles: Candle[],
  params: {
    smaPeriodFast?: number;
    smaPeriodSlow?: number;
    atrPeriod?: number;
    bollingerPeriod?: number;
    bollingerMultiplier?: number;
    supportResistanceLookback?: number;
    volatilityPeriod?: number;
  } = {},
): IndicatorSnapshot {
  const {
    smaPeriodFast = 10,
    smaPeriodSlow = 20,
    atrPeriod = 14,
    bollingerPeriod = 20,
    bollingerMultiplier = 2,
    supportResistanceLookback = 20,
    volatilityPeriod = 14,
  } = params;

  const closes = candles.map((c) => c.close);
  const latest = candles[candles.length - 1];

  return {
    smaFast: sma(closes, smaPeriodFast),
    smaSlow: sma(closes, smaPeriodSlow),
    atr: atr(candles, atrPeriod),
    bollinger: bollingerBands(closes, bollingerPeriod, bollingerMultiplier),
    supportResistance: supportResistance(candles, supportResistanceLookback),
    volatilityPct: volatilityPct(candles, volatilityPeriod),
    currentPrice: latest?.close ?? 0,
    dayHigh: latest?.high ?? 0,
    dayLow: latest?.low ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Utility: Extract closes from candles
// ---------------------------------------------------------------------------

/**
 * Extract closing prices from an array of candles.
 */
export function extractCloses(candles: Candle[]): number[] {
  return candles.map((c) => c.close);
}

/**
 * Determine trend direction based on SMA crossover.
 *
 * @param currentPrice - Current price
 * @param smaFast - Fast SMA value
 * @param smaSlow - Slow SMA value
 * @param threshold - Minimum % difference to consider SMAs diverged (default: 0.5%)
 * @returns "uptrend" | "downtrend" | "ranging"
 */
export function determineTrend(
  currentPrice: number,
  smaFast: number,
  smaSlow: number,
  threshold = 0.5,
): "uptrend" | "downtrend" | "ranging" {
  // Check if SMAs are too close together (ranging)
  const smaDiffPct = Math.abs((smaFast - smaSlow) / smaSlow) * 100;
  if (smaDiffPct < threshold) return "ranging";

  if (smaFast > smaSlow && currentPrice > smaFast) return "uptrend";
  if (smaFast < smaSlow && currentPrice < smaFast) return "downtrend";
  return "ranging";
}
