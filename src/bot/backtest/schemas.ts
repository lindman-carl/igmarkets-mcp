/**
 * Backtest Schemas — Zod v4 types for the backtesting engine.
 *
 * Defines input/output shapes for:
 * - BacktestConfig: what to test (strategy, instruments, date range, etc.)
 * - BacktestTrade: a single simulated trade (entry/exit, P&L)
 * - BacktestEquityPoint: equity value at a single bar
 * - BacktestMetrics: computed performance metrics
 * - BacktestResult: full result returned by runBacktest()
 */

import { z } from "zod/v4";
import {
  StrategyNameSchema,
  WatchlistItemSchema,
  StrategyParamsSchema,
  RiskConfigSchema,
  CircuitBreakerConfigSchema,
} from "../core/schemas.js";

// ---------------------------------------------------------------------------
// Sentiment map (epic → { longPositionPercentage, shortPositionPercentage })
// ---------------------------------------------------------------------------

export const SentimentDataSchema = z.object({
  longPositionPercentage: z.number().min(0).max(100),
  shortPositionPercentage: z.number().min(0).max(100),
});
export type BacktestSentimentData = z.infer<typeof SentimentDataSchema>;

// ---------------------------------------------------------------------------
// Backtest Configuration
// ---------------------------------------------------------------------------

export const BacktestConfigSchema = z.object({
  /** Which strategy to run */
  strategyName: StrategyNameSchema,
  /** Instruments to include (epic + expiry + currencyCode) */
  instruments: z.array(WatchlistItemSchema).min(1),
  /** Starting cash balance */
  startingCapital: z.number().positive(),
  /** Date range for the backtest */
  dateRange: z.object({
    from: z.date(),
    to: z.date(),
  }),
  /** Price resolution (e.g. "DAY", "HOUR", "MINUTE_15") */
  resolution: z.string().default("DAY"),
  /** Optional strategy parameter overrides */
  strategyParams: z.optional(StrategyParamsSchema),
  /** Optional risk config overrides */
  riskConfig: z.optional(RiskConfigSchema),
  /** Optional circuit breaker config overrides */
  circuitBreakerConfig: z.optional(CircuitBreakerConfigSchema),
  /**
   * Simulated spread in price points added to each fill.
   * Default: 1 point (realistic for major IG Markets instruments)
   */
  spreadPips: z.number().min(0).default(1),
  /**
   * Simulated slippage in price points added on top of spread.
   * Default: 0.5 points
   */
  slippagePips: z.number().min(0).default(0.5),
  /**
   * Optional static sentiment data for the sentiment-contrarian strategy.
   * Key is the epic string. When absent, sentiment-contrarian is skipped.
   */
  sentiment: z.optional(z.record(z.string(), SentimentDataSchema)),
});

export type BacktestConfig = z.infer<typeof BacktestConfigSchema>;

// ---------------------------------------------------------------------------
// Simulated Trade
// ---------------------------------------------------------------------------

export const BacktestTradeSchema = z.object({
  /** Sequential trade index within the run */
  tradeIndex: z.number().int().nonnegative(),
  /** Instrument epic */
  epic: z.string(),
  /** Strategy that generated the signal */
  strategy: StrategyNameSchema,
  /** Trade direction */
  direction: z.enum(["BUY", "SELL"]),
  /** Position size */
  size: z.number().positive(),
  /** Fill price (bar close + spread + slippage) */
  entryPrice: z.number(),
  /** Exit fill price */
  exitPrice: z.number(),
  /** Bar index (into the full candle array) when position was opened */
  entryBar: z.number().int().nonnegative(),
  /** Bar index when position was closed */
  exitBar: z.number().int().nonnegative(),
  /** Number of bars the position was held */
  barsHeld: z.number().int().nonnegative(),
  /** Realised P&L in account currency */
  pnl: z.number(),
  /** Realised P&L as fraction of entry price (not of account) */
  pnlPct: z.number(),
  /** Stop level at entry */
  stopLevel: z.optional(z.number()),
  /** Limit/target level at entry */
  limitLevel: z.optional(z.number()),
  /** Indicator data from the entry signal (for diagnostics) */
  entrySignalData: z.optional(z.record(z.string(), z.unknown())),
  /** Why the position was closed ("stop", "limit", "signal", "forced_close") */
  exitReason: z.enum(["stop", "limit", "signal", "forced_close"]),
  /** Timestamp of entry bar */
  entryTimestamp: z.optional(z.date()),
  /** Timestamp of exit bar */
  exitTimestamp: z.optional(z.date()),
});

export type BacktestTrade = z.infer<typeof BacktestTradeSchema>;

// ---------------------------------------------------------------------------
// Equity Curve Point
// ---------------------------------------------------------------------------

export const BacktestEquityPointSchema = z.object({
  /** Bar index in the candle array */
  barIndex: z.number().int().nonnegative(),
  /** Timestamp of this bar (from candle data) */
  timestamp: z.optional(z.date()),
  /** Total portfolio equity (cash + unrealised P&L) */
  equity: z.number(),
  /** Available cash (not locked in positions) */
  cash: z.number(),
  /** Sum of unrealised P&L across all open positions */
  unrealizedPnl: z.number(),
  /** Current drawdown as fraction of peak equity (0 to -1) */
  drawdownPct: z.number(),
  /** Current drawdown in absolute currency units */
  drawdownAmount: z.number(),
  /** Number of open positions at this point */
  openPositionCount: z.number().int().nonnegative(),
});

export type BacktestEquityPoint = z.infer<typeof BacktestEquityPointSchema>;

// ---------------------------------------------------------------------------
// Performance Metrics
// ---------------------------------------------------------------------------

export const BacktestMetricsSchema = z.object({
  // Returns
  /** Total P&L in account currency */
  totalReturn: z.number(),
  /** Total return as % of starting capital */
  totalReturnPct: z.number(),
  /** Annualised return % (geometric) */
  annualizedReturnPct: z.number(),

  // Risk-adjusted returns
  /** Sharpe ratio (annualised, using daily returns) */
  sharpeRatio: z.number(),
  /** Sortino ratio (annualised, penalises only downside volatility) */
  sortinoRatio: z.number(),

  // Drawdown
  /** Maximum drawdown as fraction of peak equity */
  maxDrawdownPct: z.number(),
  /** Maximum drawdown in absolute currency units */
  maxDrawdownAmount: z.number(),
  /** Duration in bars of the longest drawdown period */
  maxDrawdownDurationBars: z.number().int().nonnegative(),
  /** Average drawdown % across all drawdown periods */
  avgDrawdownPct: z.number(),

  // Trade statistics
  /** Total number of closed trades */
  totalTrades: z.number().int().nonnegative(),
  /** Number of winning trades (pnl > 0) */
  winningTrades: z.number().int().nonnegative(),
  /** Number of losing trades (pnl <= 0) */
  losingTrades: z.number().int().nonnegative(),
  /** Win rate: winningTrades / totalTrades (0-1, NaN if no trades) */
  winRate: z.number(),
  /**
   * Profit factor: gross profit / gross loss.
   * Infinity if no losing trades; 0 if no winning trades.
   */
  profitFactor: z.number(),
  /** Average winning trade P&L */
  avgWin: z.number(),
  /** Average losing trade P&L (negative value) */
  avgLoss: z.number(),

  // Duration stats
  /** Average bars held per trade */
  avgBarsHeld: z.number(),
  /** Maximum bars held in a single trade */
  maxBarsHeld: z.number().int().nonnegative(),
  /** Total bars processed by the engine (after warmup) */
  totalBarsProcessed: z.number().int().nonnegative(),

  // Final equity
  /** Ending portfolio equity */
  finalEquity: z.number(),
  /** Peak equity seen during the backtest */
  peakEquity: z.number(),
});

export type BacktestMetrics = z.infer<typeof BacktestMetricsSchema>;

// ---------------------------------------------------------------------------
// Full Backtest Result
// ---------------------------------------------------------------------------

export const BacktestResultSchema = z.object({
  /** DB row ID of the persisted run (present when db is provided to runBacktest) */
  runId: z.optional(z.number().int().positive()),
  /** Input configuration */
  config: BacktestConfigSchema,
  /** Computed performance metrics */
  metrics: BacktestMetricsSchema,
  /** All closed trades */
  trades: z.array(BacktestTradeSchema),
  /** Bar-by-bar equity curve */
  equityCurve: z.array(BacktestEquityPointSchema),
  /** When the backtest started (wall-clock time) */
  startedAt: z.date(),
  /** When the backtest finished (wall-clock time) */
  completedAt: z.date(),
  /** Wall-clock duration in milliseconds */
  durationMs: z.number().int().nonnegative(),
  /** Non-fatal warnings (e.g. sentiment data missing, candle gaps) */
  warnings: z.array(z.string()),
});

export type BacktestResult = z.infer<typeof BacktestResultSchema>;

// ---------------------------------------------------------------------------
// DB insert types (for backtest-state.ts)
// ---------------------------------------------------------------------------

export const InsertBacktestRunSchema = z.object({
  strategyName: StrategyNameSchema,
  instruments: z.array(WatchlistItemSchema),
  startingCapital: z.number().positive(),
  dateFrom: z.date(),
  dateTo: z.date(),
  resolution: z.string(),
  strategyParams: z.optional(z.unknown()),
  riskConfig: z.optional(z.unknown()),
  spreadPips: z.number().min(0),
  slippagePips: z.number().min(0),
  status: z.enum(["running", "completed", "error"]).default("running"),
  metrics: z.optional(z.unknown()),
  warnings: z.optional(z.array(z.string())),
  totalTrades: z.optional(z.number().int().nonnegative()),
  totalBars: z.optional(z.number().int().nonnegative()),
  durationMs: z.optional(z.number().int().nonnegative()),
  startedAt: z.date(),
  completedAt: z.optional(z.date()),
});

export type InsertBacktestRun = z.infer<typeof InsertBacktestRunSchema>;

export const InsertBacktestTradeSchema = z.object({
  runId: z.number().int().positive(),
  epic: z.string(),
  strategy: StrategyNameSchema,
  direction: z.enum(["BUY", "SELL"]),
  size: z.number().positive(),
  entryPrice: z.number(),
  exitPrice: z.number(),
  entryBar: z.number().int().nonnegative(),
  exitBar: z.number().int().nonnegative(),
  barsHeld: z.number().int().nonnegative(),
  pnl: z.number(),
  pnlPct: z.number(),
  stopLevel: z.optional(z.number()),
  limitLevel: z.optional(z.number()),
  entrySignalData: z.optional(z.unknown()),
  exitReason: z.enum(["stop", "limit", "signal", "forced_close"]),
  entryTimestamp: z.optional(z.date()),
  exitTimestamp: z.optional(z.date()),
});

export type InsertBacktestTrade = z.infer<typeof InsertBacktestTradeSchema>;

export const InsertBacktestEquitySchema = z.object({
  runId: z.number().int().positive(),
  barIndex: z.number().int().nonnegative(),
  timestamp: z.optional(z.date()),
  equity: z.number(),
  cash: z.number(),
  unrealizedPnl: z.number(),
  drawdownPct: z.number(),
  drawdownAmount: z.number(),
  openPositionCount: z.number().int().nonnegative(),
});

export type InsertBacktestEquity = z.infer<typeof InsertBacktestEquitySchema>;
