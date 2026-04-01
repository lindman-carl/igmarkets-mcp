/**
 * Backtest Metrics — Pure Performance Metrics Calculator
 *
 * All functions are pure math — no I/O, no side effects.
 * Input: arrays of BacktestTrade and BacktestEquityPoint
 * Output: BacktestMetrics
 *
 * Metrics computed:
 * - totalReturn, totalReturnPct, annualizedReturnPct
 * - sharpeRatio, sortinoRatio (annualised, daily returns)
 * - maxDrawdownPct, maxDrawdownAmount, maxDrawdownDurationBars, avgDrawdownPct
 * - totalTrades, winningTrades, losingTrades, winRate, profitFactor
 * - avgWin, avgLoss, avgBarsHeld, maxBarsHeld
 * - finalEquity, peakEquity, totalBarsProcessed
 */

import type {
  BacktestTrade,
  BacktestEquityPoint,
  BacktestMetrics,
} from "./backtest-schemas.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Assumed risk-free rate (0% — simplifies Sharpe to return / volatility) */
const RISK_FREE_RATE_DAILY = 0;

/** Trading days per year used for annualisation */
const TRADING_DAYS_PER_YEAR = 252;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compute all performance metrics from the backtest outputs.
 *
 * @param trades       - All closed BacktestTrade records
 * @param equityCurve  - Bar-by-bar equity snapshots (oldest first)
 * @param startingCapital - Starting account balance
 * @param totalBarsProcessed - Number of bars the engine iterated
 */
export function computeMetrics(
  trades: BacktestTrade[],
  equityCurve: BacktestEquityPoint[],
  startingCapital: number,
  totalBarsProcessed: number,
): BacktestMetrics {
  const finalEquity =
    equityCurve.length > 0
      ? equityCurve[equityCurve.length - 1]!.equity
      : startingCapital;

  const peakEquity = equityCurve.reduce(
    (max, pt) => Math.max(max, pt.equity),
    startingCapital,
  );

  // ---------------------------------------------------------------------------
  // Return metrics
  // ---------------------------------------------------------------------------

  const totalReturn = finalEquity - startingCapital;
  const totalReturnPct =
    startingCapital > 0 ? totalReturn / startingCapital : 0;

  // Annualised return: CAGR using number of bars processed
  const yearsElapsed =
    totalBarsProcessed > 0 ? totalBarsProcessed / TRADING_DAYS_PER_YEAR : 0;
  const annualizedReturnPct =
    yearsElapsed > 0 && startingCapital > 0
      ? Math.pow(finalEquity / startingCapital, 1 / yearsElapsed) - 1
      : 0;

  // ---------------------------------------------------------------------------
  // Risk-adjusted returns (Sharpe & Sortino)
  // ---------------------------------------------------------------------------

  const dailyReturns = computeDailyReturns(equityCurve);
  const sharpeRatio = computeSharpe(dailyReturns, TRADING_DAYS_PER_YEAR);
  const sortinoRatio = computeSortino(
    dailyReturns,
    RISK_FREE_RATE_DAILY,
    TRADING_DAYS_PER_YEAR,
  );

  // ---------------------------------------------------------------------------
  // Drawdown metrics
  // ---------------------------------------------------------------------------

  const drawdownMetrics = computeDrawdownMetrics(equityCurve);

  // ---------------------------------------------------------------------------
  // Trade statistics
  // ---------------------------------------------------------------------------

  const tradeStats = computeTradeStats(trades);

  return {
    totalReturn,
    totalReturnPct,
    annualizedReturnPct,
    sharpeRatio,
    sortinoRatio,
    ...drawdownMetrics,
    ...tradeStats,
    totalBarsProcessed,
    finalEquity,
    peakEquity,
  };
}

// ---------------------------------------------------------------------------
// Daily return series
// ---------------------------------------------------------------------------

/**
 * Derive a bar-by-bar return series from the equity curve.
 * r[i] = (equity[i] - equity[i-1]) / equity[i-1]
 *
 * An empty array is returned when there are fewer than 2 equity points.
 */
export function computeDailyReturns(
  equityCurve: BacktestEquityPoint[],
): number[] {
  if (equityCurve.length < 2) return [];
  const returns: number[] = [];
  for (let i = 1; i < equityCurve.length; i++) {
    const prev = equityCurve[i - 1]!.equity;
    const curr = equityCurve[i]!.equity;
    returns.push(prev !== 0 ? (curr - prev) / prev : 0);
  }
  return returns;
}

// ---------------------------------------------------------------------------
// Sharpe ratio
// ---------------------------------------------------------------------------

/**
 * Annualised Sharpe ratio.
 *
 * sharpe = mean(returns - riskFree) / std(returns - riskFree) * sqrt(periodsPerYear)
 *
 * Returns 0 when there are no returns or volatility is zero.
 */
export function computeSharpe(
  returns: number[],
  periodsPerYear: number,
  riskFreeRatePerPeriod = 0,
): number {
  if (returns.length === 0) return 0;
  const excess = returns.map((r) => r - riskFreeRatePerPeriod);
  const mean = arrayMean(excess);
  const std = arrayStd(excess);
  if (std === 0) return 0;
  return (mean / std) * Math.sqrt(periodsPerYear);
}

// ---------------------------------------------------------------------------
// Sortino ratio
// ---------------------------------------------------------------------------

/**
 * Annualised Sortino ratio.
 *
 * sortino = mean(returns - riskFree) / downside_deviation * sqrt(periodsPerYear)
 * downside_deviation = std of negative excess returns
 *
 * Returns 0 when there are no returns or downside deviation is zero.
 */
export function computeSortino(
  returns: number[],
  riskFreeRatePerPeriod: number,
  periodsPerYear: number,
): number {
  if (returns.length === 0) return 0;
  const excess = returns.map((r) => r - riskFreeRatePerPeriod);
  const mean = arrayMean(excess);
  const downsideReturns = excess.filter((r) => r < 0);
  if (downsideReturns.length === 0) {
    // All returns are non-negative — infinite Sortino; cap at a large value
    return mean > 0 ? Infinity : 0;
  }
  const downsideStd = arrayStd(downsideReturns);
  if (downsideStd === 0) return 0;
  return (mean / downsideStd) * Math.sqrt(periodsPerYear);
}

// ---------------------------------------------------------------------------
// Drawdown metrics
// ---------------------------------------------------------------------------

interface DrawdownMetrics {
  maxDrawdownPct: number;
  maxDrawdownAmount: number;
  maxDrawdownDurationBars: number;
  avgDrawdownPct: number;
}

/**
 * Compute drawdown-related metrics from the equity curve.
 *
 * maxDrawdownPct — worst peak-to-trough drawdown as a fraction (negative)
 * maxDrawdownAmount — worst peak-to-trough in absolute currency (negative)
 * maxDrawdownDurationBars — longest streak of bars in drawdown
 * avgDrawdownPct — mean of drawdownPct values that are < 0
 */
export function computeDrawdownMetrics(
  equityCurve: BacktestEquityPoint[],
): DrawdownMetrics {
  if (equityCurve.length === 0) {
    return {
      maxDrawdownPct: 0,
      maxDrawdownAmount: 0,
      maxDrawdownDurationBars: 0,
      avgDrawdownPct: 0,
    };
  }

  let maxDrawdownPct = 0;
  let maxDrawdownAmount = 0;
  let maxDrawdownDurationBars = 0;
  let currentDrawdownStreak = 0;
  const drawdownValues: number[] = [];

  for (const pt of equityCurve) {
    if (pt.drawdownPct < maxDrawdownPct) maxDrawdownPct = pt.drawdownPct;
    if (pt.drawdownAmount < maxDrawdownAmount)
      maxDrawdownAmount = pt.drawdownAmount;

    if (pt.drawdownPct < 0) {
      currentDrawdownStreak++;
      drawdownValues.push(pt.drawdownPct);
    } else {
      if (currentDrawdownStreak > maxDrawdownDurationBars) {
        maxDrawdownDurationBars = currentDrawdownStreak;
      }
      currentDrawdownStreak = 0;
    }
  }
  // Capture final streak if still in drawdown at end
  if (currentDrawdownStreak > maxDrawdownDurationBars) {
    maxDrawdownDurationBars = currentDrawdownStreak;
  }

  const avgDrawdownPct =
    drawdownValues.length > 0 ? arrayMean(drawdownValues) : 0;

  return {
    maxDrawdownPct,
    maxDrawdownAmount,
    maxDrawdownDurationBars,
    avgDrawdownPct,
  };
}

// ---------------------------------------------------------------------------
// Trade statistics
// ---------------------------------------------------------------------------

interface TradeStats {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  profitFactor: number;
  avgWin: number;
  avgLoss: number;
  avgBarsHeld: number;
  maxBarsHeld: number;
}

/**
 * Compute per-trade statistics from the list of closed trades.
 */
export function computeTradeStats(trades: BacktestTrade[]): TradeStats {
  const totalTrades = trades.length;

  if (totalTrades === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: NaN,
      profitFactor: 0,
      avgWin: 0,
      avgLoss: 0,
      avgBarsHeld: 0,
      maxBarsHeld: 0,
    };
  }

  const winners = trades.filter((t) => t.pnl > 0);
  const losers = trades.filter((t) => t.pnl <= 0);

  const winningTrades = winners.length;
  const losingTrades = losers.length;
  const winRate = winningTrades / totalTrades;

  const grossProfit = winners.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losers.reduce((sum, t) => sum + t.pnl, 0));

  let profitFactor: number;
  if (grossLoss === 0) {
    profitFactor = grossProfit > 0 ? Infinity : 0;
  } else {
    profitFactor = grossProfit / grossLoss;
  }

  const avgWin = winningTrades > 0 ? grossProfit / winningTrades : 0;
  const avgLoss = losingTrades > 0 ? -(grossLoss / losingTrades) : 0;

  const totalBarsHeld = trades.reduce((sum, t) => sum + t.barsHeld, 0);
  const avgBarsHeld = totalBarsHeld / totalTrades;
  const maxBarsHeld = trades.reduce((max, t) => Math.max(max, t.barsHeld), 0);

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRate,
    profitFactor,
    avgWin,
    avgLoss,
    avgBarsHeld,
    maxBarsHeld,
  };
}

// ---------------------------------------------------------------------------
// Array math helpers
// ---------------------------------------------------------------------------

/** Arithmetic mean of an array. Returns 0 for empty arrays. */
export function arrayMean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Population standard deviation of an array.
 * Returns 0 for arrays with fewer than 2 elements.
 */
export function arrayStd(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = arrayMean(values);
  const variance =
    values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
