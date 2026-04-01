/**
 * Strategy Runner — Signal Detection Engine
 *
 * Evaluates market data against the configured strategy and generates
 * trading signals (entry, exit, adjust). Each strategy implements the
 * rules documented in skills/trading-strategies/SKILL.md.
 *
 * Strategies:
 * 1. Trend Following — SMA crossover + ATR stops
 * 2. Breakout — N-period high/low breakout
 * 3. Mean Reversion — Bollinger Band extremes + sentiment filter
 * 4. Sentiment Contrarian — Extreme IG client sentiment
 *
 * All strategies are pure functions: (candles, indicators, sentiment, params) → Signal[]
 */

import type { Candle, IndicatorSnapshot } from "../lib/indicators.js";
import { calculateIndicators, determineTrend } from "../lib/indicators.js";
import type {
  StrategyName,
  StrategyParams,
  SignalAction,
  SignalType,
  IndicatorData,
} from "./schemas.js";
import { DEFAULT_STRATEGY_PARAMS } from "./schemas.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Sentiment data from IG client sentiment API. */
export interface SentimentData {
  longPositionPercentage: number;
  shortPositionPercentage: number;
}

/** A raw signal produced by a strategy (before persistence). */
export interface StrategySignal {
  epic: string;
  strategy: StrategyName;
  action: SignalAction;
  signalType: SignalType;
  confidence: number;
  priceAtSignal: number;
  suggestedStop: number | null;
  suggestedLimit: number | null;
  suggestedSize: number | null;
  indicatorData: IndicatorData;
}

/** Context passed to each strategy function. */
export interface StrategyContext {
  epic: string;
  candles: Candle[];
  indicators: IndicatorSnapshot;
  sentiment: SentimentData | null;
  params: StrategyParams;
  /** Whether the bot currently has an open position for this epic. */
  hasOpenPosition: boolean;
  /** Direction of any open position ("BUY" | "SELL" | null). */
  openPositionDirection: "BUY" | "SELL" | null;
}

// ---------------------------------------------------------------------------
// Main Entry Point
// ---------------------------------------------------------------------------

/**
 * Run the configured strategy against market data and return generated signals.
 *
 * @param strategy - Which strategy to run
 * @param epic - Instrument epic
 * @param candles - OHLC candles (oldest first, at least 21 recommended)
 * @param sentiment - IG client sentiment data (optional)
 * @param params - Strategy parameters (defaults applied if not provided)
 * @param hasOpenPosition - Whether bot has an open position for this epic
 * @param openPositionDirection - Direction of any open position
 * @returns Array of signals (may be empty if no signal generated)
 */
export function runStrategy(
  strategy: StrategyName,
  epic: string,
  candles: Candle[],
  sentiment: SentimentData | null,
  params: StrategyParams = DEFAULT_STRATEGY_PARAMS,
  hasOpenPosition = false,
  openPositionDirection: "BUY" | "SELL" | null = null,
): StrategySignal[] {
  const indicators = calculateIndicators(candles, {
    smaPeriodFast: params.smaPeriodFast,
    smaPeriodSlow: params.smaPeriodSlow,
    atrPeriod: params.atrPeriod,
  });

  const ctx: StrategyContext = {
    epic,
    candles,
    indicators,
    sentiment,
    params,
    hasOpenPosition,
    openPositionDirection,
  };

  switch (strategy) {
    case "trend-following":
      return trendFollowingStrategy(ctx);
    case "breakout":
      return breakoutStrategy(ctx);
    case "mean-reversion":
      return meanReversionStrategy(ctx);
    case "sentiment-contrarian":
      return sentimentContrarianStrategy(ctx);
  }
}

// ---------------------------------------------------------------------------
// Helper: Build indicator data for persistence
// ---------------------------------------------------------------------------

function buildIndicatorData(
  indicators: IndicatorSnapshot,
  sentiment: SentimentData | null,
): IndicatorData {
  return {
    smaFast: indicators.smaFast ?? undefined,
    smaSlow: indicators.smaSlow ?? undefined,
    atr: indicators.atr ?? undefined,
    bollingerUpper: indicators.bollinger?.upper ?? undefined,
    bollingerLower: indicators.bollinger?.lower ?? undefined,
    bollingerMiddle: indicators.bollinger?.middle ?? undefined,
    sentimentLongPct: sentiment?.longPositionPercentage ?? undefined,
    sentimentShortPct: sentiment?.shortPositionPercentage ?? undefined,
    currentPrice: indicators.currentPrice ?? undefined,
    dayHigh: indicators.dayHigh ?? undefined,
    dayLow: indicators.dayLow ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Strategy 1: Trend Following
// ---------------------------------------------------------------------------

/**
 * Trend Following Strategy:
 * - Entry: SMA10 > SMA20 (uptrend) → BUY; SMA10 < SMA20 (downtrend) → SELL
 * - Filter: Price must be within 1 ATR of SMA10 (pull-back entry)
 * - Stop: 1.5x ATR from entry
 * - Target: 3x ATR from entry
 * - Exit: SMA crossover reversal or price crosses SMA10 against position
 */
function trendFollowingStrategy(ctx: StrategyContext): StrategySignal[] {
  const {
    epic,
    indicators,
    sentiment,
    params,
    hasOpenPosition,
    openPositionDirection,
  } = ctx;
  const signals: StrategySignal[] = [];
  const indicatorData = buildIndicatorData(indicators, sentiment);

  const { smaFast, smaSlow, atr: atrVal, currentPrice } = indicators;

  // Need all core indicators
  if (smaFast === null || smaSlow === null || atrVal === null) return signals;

  const trend = determineTrend(currentPrice, smaFast, smaSlow);

  // --- Exit signals ---
  if (hasOpenPosition && openPositionDirection) {
    const shouldExit =
      (openPositionDirection === "BUY" && trend !== "uptrend") ||
      (openPositionDirection === "SELL" && trend !== "downtrend");

    if (shouldExit) {
      signals.push({
        epic,
        strategy: "trend-following",
        action: "close",
        signalType: "exit",
        confidence: 0.7,
        priceAtSignal: currentPrice,
        suggestedStop: null,
        suggestedLimit: null,
        suggestedSize: null,
        indicatorData,
      });
      return signals;
    }
  }

  // --- Entry signals ---
  if (hasOpenPosition) return signals; // Already in a position, no new entry

  // Check pull-back: price within 1 ATR of SMA fast
  const pullBackDistance = Math.abs(currentPrice - smaFast);
  const isPullBack = pullBackDistance <= atrVal;

  if (trend === "uptrend" && isPullBack) {
    const stopDistance = params.atrStopMultiplier * atrVal;
    const targetDistance = params.atrTargetMultiplier * atrVal;

    signals.push({
      epic,
      strategy: "trend-following",
      action: "buy",
      signalType: "entry",
      confidence: 0.65,
      priceAtSignal: currentPrice,
      suggestedStop: currentPrice - stopDistance,
      suggestedLimit: currentPrice + targetDistance,
      suggestedSize: null, // Calculated by position sizer
      indicatorData,
    });
  } else if (trend === "downtrend" && isPullBack) {
    const stopDistance = params.atrStopMultiplier * atrVal;
    const targetDistance = params.atrTargetMultiplier * atrVal;

    signals.push({
      epic,
      strategy: "trend-following",
      action: "sell",
      signalType: "entry",
      confidence: 0.65,
      priceAtSignal: currentPrice,
      suggestedStop: currentPrice + stopDistance,
      suggestedLimit: currentPrice - targetDistance,
      suggestedSize: null,
      indicatorData,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Strategy 2: Breakout
// ---------------------------------------------------------------------------

/**
 * Breakout Strategy:
 * - Entry: Daily close above N-period high (BUY) or below N-period low (SELL)
 * - Buffer: 0.5% above resistance / below support for entry level
 * - Target: Range width projected from breakout level
 * - Stop: 1.5x ATR
 * - Exit: Price returns inside range or target hit
 */
function breakoutStrategy(ctx: StrategyContext): StrategySignal[] {
  const {
    epic,
    indicators,
    sentiment,
    params,
    hasOpenPosition,
    openPositionDirection,
  } = ctx;
  const signals: StrategySignal[] = [];
  const indicatorData = buildIndicatorData(indicators, sentiment);

  const { currentPrice, atr: atrVal, supportResistance: sr } = indicators;

  if (!sr || atrVal === null) return signals;

  const { support, resistance, rangeWidth } = sr;
  const bufferPct = 0.005; // 0.5%

  // --- Exit signals ---
  if (hasOpenPosition && openPositionDirection) {
    const priceInsideRange =
      currentPrice > support && currentPrice < resistance;
    if (priceInsideRange) {
      signals.push({
        epic,
        strategy: "breakout",
        action: "close",
        signalType: "exit",
        confidence: 0.6,
        priceAtSignal: currentPrice,
        suggestedStop: null,
        suggestedLimit: null,
        suggestedSize: null,
        indicatorData,
      });
      return signals;
    }
  }

  // --- Entry signals ---
  if (hasOpenPosition) return signals;

  // Bullish breakout: close above resistance + buffer
  if (currentPrice > resistance * (1 + bufferPct)) {
    const stopDistance = params.atrStopMultiplier * atrVal;
    signals.push({
      epic,
      strategy: "breakout",
      action: "buy",
      signalType: "entry",
      confidence: 0.6,
      priceAtSignal: currentPrice,
      suggestedStop: currentPrice - stopDistance,
      suggestedLimit: currentPrice + rangeWidth,
      suggestedSize: null,
      indicatorData,
    });
  }

  // Bearish breakout: close below support - buffer
  if (currentPrice < support * (1 - bufferPct)) {
    const stopDistance = params.atrStopMultiplier * atrVal;
    signals.push({
      epic,
      strategy: "breakout",
      action: "sell",
      signalType: "entry",
      confidence: 0.6,
      priceAtSignal: currentPrice,
      suggestedStop: currentPrice + stopDistance,
      suggestedLimit: currentPrice - rangeWidth,
      suggestedSize: null,
      indicatorData,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Strategy 3: Mean Reversion
// ---------------------------------------------------------------------------

/**
 * Mean Reversion Strategy:
 * - Entry long: Price ≤ lower Bollinger Band AND sentiment >55% short
 * - Entry short: Price ≥ upper Bollinger Band AND sentiment >55% long
 * - Target: SMA20 (middle band)
 * - Stop: 0.5x band width beyond entry band
 * - Exit: Return to SMA20 or 5-day time exit
 */
function meanReversionStrategy(ctx: StrategyContext): StrategySignal[] {
  const {
    epic,
    indicators,
    sentiment,
    params,
    hasOpenPosition,
    openPositionDirection,
  } = ctx;
  const signals: StrategySignal[] = [];
  const indicatorData = buildIndicatorData(indicators, sentiment);

  const { currentPrice, bollinger } = indicators;

  if (!bollinger) return signals;

  const { upper, lower, middle, width } = bollinger;

  // --- Exit signals ---
  if (hasOpenPosition && openPositionDirection) {
    // Exit when price returns to the mean (middle band)
    const nearMiddle = Math.abs(currentPrice - middle) < width * 0.1;
    if (nearMiddle) {
      signals.push({
        epic,
        strategy: "mean-reversion",
        action: "close",
        signalType: "exit",
        confidence: 0.7,
        priceAtSignal: currentPrice,
        suggestedStop: null,
        suggestedLimit: null,
        suggestedSize: null,
        indicatorData,
      });
      return signals;
    }
  }

  // --- Entry signals ---
  if (hasOpenPosition) return signals;

  const sentimentFilter = 55;

  // Long entry: oversold (price ≤ lower band) + bearish sentiment
  if (
    currentPrice <= lower &&
    sentiment &&
    sentiment.shortPositionPercentage > sentimentFilter
  ) {
    signals.push({
      epic,
      strategy: "mean-reversion",
      action: "buy",
      signalType: "entry",
      confidence: 0.55,
      priceAtSignal: currentPrice,
      suggestedStop: lower - width * 0.5,
      suggestedLimit: middle,
      suggestedSize: null,
      indicatorData,
    });
  }

  // Short entry: overbought (price ≥ upper band) + bullish sentiment
  if (
    currentPrice >= upper &&
    sentiment &&
    sentiment.longPositionPercentage > sentimentFilter
  ) {
    signals.push({
      epic,
      strategy: "mean-reversion",
      action: "sell",
      signalType: "entry",
      confidence: 0.55,
      priceAtSignal: currentPrice,
      suggestedStop: upper + width * 0.5,
      suggestedLimit: middle,
      suggestedSize: null,
      indicatorData,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Strategy 4: Sentiment Contrarian
// ---------------------------------------------------------------------------

/**
 * Sentiment Contrarian Strategy:
 * - Entry short: Sentiment >75% long + price near resistance
 * - Entry long: Sentiment >75% short + price near support
 * - Exit: Sentiment returns to 55-60% range or 10-day time exit
 * - Stop: 1.5x ATR
 */
function sentimentContrarianStrategy(ctx: StrategyContext): StrategySignal[] {
  const {
    epic,
    indicators,
    sentiment,
    params,
    hasOpenPosition,
    openPositionDirection,
  } = ctx;
  const signals: StrategySignal[] = [];
  const indicatorData = buildIndicatorData(indicators, sentiment);

  if (!sentiment) return signals; // Can't run without sentiment data

  const { currentPrice, atr: atrVal, supportResistance: sr } = indicators;

  if (atrVal === null) return signals;

  const extremeThreshold = 75;
  const normalThreshold = 60;

  // --- Exit signals ---
  if (hasOpenPosition && openPositionDirection) {
    const sentimentNormalized =
      sentiment.longPositionPercentage <= normalThreshold &&
      sentiment.shortPositionPercentage <= normalThreshold;

    if (sentimentNormalized) {
      signals.push({
        epic,
        strategy: "sentiment-contrarian",
        action: "close",
        signalType: "exit",
        confidence: 0.65,
        priceAtSignal: currentPrice,
        suggestedStop: null,
        suggestedLimit: null,
        suggestedSize: null,
        indicatorData,
      });
      return signals;
    }
  }

  // --- Entry signals ---
  if (hasOpenPosition) return signals;

  const stopDistance = params.atrStopMultiplier * atrVal;

  // Contrarian short: extreme bullish sentiment + near resistance
  if (
    sentiment.longPositionPercentage > extremeThreshold &&
    sr &&
    currentPrice > sr.resistance - sr.rangeWidth * 0.1
  ) {
    signals.push({
      epic,
      strategy: "sentiment-contrarian",
      action: "sell",
      signalType: "entry",
      confidence: 0.5,
      priceAtSignal: currentPrice,
      suggestedStop: currentPrice + stopDistance,
      suggestedLimit: sr.support,
      suggestedSize: null,
      indicatorData,
    });
  }

  // Contrarian long: extreme bearish sentiment + near support
  if (
    sentiment.shortPositionPercentage > extremeThreshold &&
    sr &&
    currentPrice < sr.support + sr.rangeWidth * 0.1
  ) {
    signals.push({
      epic,
      strategy: "sentiment-contrarian",
      action: "buy",
      signalType: "entry",
      confidence: 0.5,
      priceAtSignal: currentPrice,
      suggestedStop: currentPrice - stopDistance,
      suggestedLimit: sr.resistance,
      suggestedSize: null,
      indicatorData,
    });
  }

  return signals;
}
