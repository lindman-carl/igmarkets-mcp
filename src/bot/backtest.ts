/**
 * Backtest Engine — Main Entry Point
 *
 * Replays historical candles through the same strategy, position sizing,
 * and circuit breaker logic used in live trading.
 *
 * Architecture:
 * - `loadCandles()` — fetch candle data from DB or provided array
 * - `runBacktest()` — orchestrate the full simulation for one strategy + instruments
 * - Inner loop per instrument per bar:
 *     1. runStrategy() → signals
 *     2. For exit signals: close open position via VirtualPortfolio
 *     3. For entry signals: calculatePositionSize() → openPosition()
 *     4. checkStopLimit() for all open positions → auto-close on hit
 *     5. markToMarket() to snapshot equity
 * - computeMetrics() to produce summary statistics
 * - Optional persistence: insertBacktestRun / insertBacktestTrades / insertBacktestEquity
 *
 * Notes:
 * - The circuit breaker runs in "simulation mode": it uses an in-memory
 *   state copy and is reset at each bar (no real cooldown delays).
 * - Candles are aligned per instrument: each instrument's candles advance
 *   independently; the engine iterates by bar index over the longest series.
 * - If `db` is not provided, results are returned in-memory only.
 */

import { and, eq, gte, lte, asc } from "drizzle-orm";
import { candles as candlesTable } from "../db/schema.js";
import type { Candle } from "../lib/indicators.js";
import { calculateIndicators } from "../lib/indicators.js";
import { runStrategy } from "./strategy-runner.js";
import {
  calculatePositionSize,
  calculateTrailingStop,
} from "./position-sizer.js";
import {
  checkCircuitBreaker,
  recordWin,
  recordLoss,
} from "./circuit-breaker.js";
import { VirtualPortfolio } from "./backtest-portfolio.js";
import { computeMetrics } from "./backtest-metrics.js";
import {
  insertBacktestRun,
  updateBacktestRun,
  insertBacktestTrades,
  insertBacktestEquity,
} from "./backtest-state.js";
import type {
  BacktestConfig,
  BacktestResult,
  BacktestTrade,
} from "./backtest-schemas.js";
import type { BotDatabase } from "../db/connection.js";
import type { CircuitBreakerState, StrategyParams } from "./schemas.js";
import {
  DEFAULT_STRATEGY_PARAMS,
  DEFAULT_RISK_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_STATE,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Candle loading
// ---------------------------------------------------------------------------

/**
 * Load candles for a given epic from the database.
 *
 * Returns candles sorted oldest-first between dateFrom and dateTo.
 *
 * @param db          - Database connection
 * @param epic        - Instrument epic
 * @param resolution  - Price resolution (e.g. "DAY")
 * @param dateFrom    - Start of date range (inclusive)
 * @param dateTo      - End of date range (inclusive)
 */
export async function loadCandles(
  db: BotDatabase,
  epic: string,
  resolution: string,
  dateFrom: Date,
  dateTo: Date,
): Promise<BacktestCandle[]> {
  const rows = await db
    .select()
    .from(candlesTable)
    .where(
      and(
        eq(candlesTable.epic, epic),
        eq(candlesTable.resolution, resolution),
        gte(candlesTable.timestamp, dateFrom),
        lte(candlesTable.timestamp, dateTo),
      ),
    )
    .orderBy(asc(candlesTable.timestamp));

  return rows.map((r) => ({
    open: r.open,
    high: r.high,
    low: r.low,
    close: r.close,
    timestamp: r.timestamp ?? undefined,
    volume: r.volume ?? undefined,
  }));
}

// ---------------------------------------------------------------------------
// BacktestCandle — Candle with optional timestamp
// ---------------------------------------------------------------------------

export interface BacktestCandle extends Candle {
  timestamp?: Date;
  volume?: number;
}

// ---------------------------------------------------------------------------
// runBacktest
// ---------------------------------------------------------------------------

/**
 * Run a backtest simulation.
 *
 * @param config    - Backtest configuration (strategy, instruments, date range, etc.)
 * @param candles   - Pre-loaded candle map (epic → candle array).
 *                    If not provided (or empty for an epic), candles are loaded from `db`.
 * @param db        - Optional database connection. Required for candle loading
 *                    and result persistence. If omitted and candles are not provided,
 *                    the run will have empty trade history.
 *
 * @returns BacktestResult with metrics, trades, equity curve, and optional runId
 */
export async function runBacktest(
  config: BacktestConfig,
  candles?: Map<string, BacktestCandle[]>,
  db?: BotDatabase,
): Promise<BacktestResult> {
  const startedAt = new Date();
  const warnings: string[] = [];

  // -------------------------------------------------------------------------
  // Resolve config defaults
  // -------------------------------------------------------------------------
  const strategyParams = config.strategyParams ?? DEFAULT_STRATEGY_PARAMS;
  const riskConfig = config.riskConfig ?? DEFAULT_RISK_CONFIG;
  const cbConfig =
    config.circuitBreakerConfig ?? DEFAULT_CIRCUIT_BREAKER_CONFIG;

  // -------------------------------------------------------------------------
  // Load candle data per instrument
  // -------------------------------------------------------------------------
  const candleMap = new Map<string, BacktestCandle[]>();

  for (const instrument of config.instruments) {
    const { epic } = instrument;

    // Check pre-provided candles first
    const provided = candles?.get(epic);
    if (provided && provided.length > 0) {
      candleMap.set(epic, provided);
      continue;
    }

    // Load from DB
    if (db) {
      const loaded = await loadCandles(
        db,
        epic,
        config.resolution,
        config.dateRange.from,
        config.dateRange.to,
      );
      if (loaded.length === 0) {
        warnings.push(
          `No candles found for epic "${epic}" in date range — skipped.`,
        );
      } else {
        candleMap.set(epic, loaded);
      }
    } else {
      warnings.push(
        `No candles provided for epic "${epic}" and no DB connection — skipped.`,
      );
    }
  }

  // -------------------------------------------------------------------------
  // Create DB run record (if DB available)
  // -------------------------------------------------------------------------
  let runId: number | undefined;
  if (db) {
    runId = await insertBacktestRun(db, {
      strategyName: config.strategyName,
      instruments: config.instruments,
      startingCapital: config.startingCapital,
      dateFrom: config.dateRange.from,
      dateTo: config.dateRange.to,
      resolution: config.resolution,
      strategyParams: config.strategyParams ?? null,
      riskConfig: config.riskConfig ?? null,
      spreadPips: config.spreadPips,
      slippagePips: config.slippagePips,
      status: "running",
      startedAt,
    });
  }

  // -------------------------------------------------------------------------
  // Set up simulation state
  // -------------------------------------------------------------------------
  const portfolio = new VirtualPortfolio({
    startingCapital: config.startingCapital,
    spreadPips: config.spreadPips,
    slippagePips: config.slippagePips,
  });

  let cbState: CircuitBreakerState = { ...DEFAULT_CIRCUIT_BREAKER_STATE };
  let totalBarsProcessed = 0;
  let dailyPnl = 0;
  let lastResetDay = -1; // day-of-year for daily P&L reset (bar index based)

  // We need a warmup window for indicators (SMA period)
  const warmupBars = strategyParams.smaPeriodSlow;

  // -------------------------------------------------------------------------
  // Determine the total number of bars to iterate (longest candle series)
  // -------------------------------------------------------------------------
  let maxBars = 0;
  for (const series of candleMap.values()) {
    if (series.length > maxBars) maxBars = series.length;
  }

  // -------------------------------------------------------------------------
  // Bar-by-bar simulation loop
  // -------------------------------------------------------------------------
  for (let barIndex = 0; barIndex < maxBars; barIndex++) {
    // Daily P&L reset every ~24 bars (simulate "day boundary" in sub-day runs)
    // For day-resolution data this is simply every bar.
    if (barIndex !== lastResetDay) {
      dailyPnl = 0;
      lastResetDay = barIndex;
    }

    // Check circuit breaker before processing this bar
    const cbCheck = checkCircuitBreaker(
      cbState,
      cbConfig,
      portfolio.getEquity(),
    );
    if (!cbCheck.canTrade) {
      // Still advance positions (stop/limit checks) but skip new signals
      // fall through with skipNewSignals = true
    }
    cbState = cbCheck.state;
    const skipNewSignals = !cbCheck.canTrade;

    // Build current price map for mark-to-market
    const currentPrices = new Map<string, number>();

    for (const instrument of config.instruments) {
      const { epic } = instrument;
      const series = candleMap.get(epic);
      if (!series || barIndex >= series.length) continue;

      const bar = series[barIndex]!;
      currentPrices.set(epic, bar.close);
    }

    // -----------------------------------------------------------------------
    // Per-instrument processing
    // -----------------------------------------------------------------------
    for (const instrument of config.instruments) {
      const { epic } = instrument;
      const series = candleMap.get(epic);
      if (!series || barIndex >= series.length) continue;

      const bar = series[barIndex]!;
      const barInfo = {
        index: barIndex,
        closePrice: bar.close,
        timestamp: bar.timestamp,
      };

      // We need enough bars for indicators
      const candleWindow = series.slice(0, barIndex + 1);
      if (candleWindow.length < warmupBars) continue;

      // -----------------------------------------------------------------
      // Check stop/limit on existing open position for this epic
      // -----------------------------------------------------------------
      const openPos = portfolio.getOpenPositionForEpic(epic);
      if (openPos) {
        // Update trailing stop if strategy uses ATR-based trailing
        const indicators = getLastIndicators(candleWindow, strategyParams);
        if (indicators.atr !== null && openPos.stopLevel !== null) {
          const newStop = calculateTrailingStop(
            openPos.direction,
            openPos.entryPrice,
            bar.close,
            openPos.stopLevel,
            indicators.atr,
          );
          if (newStop !== null) {
            portfolio.updateStop(openPos.dealId, newStop);
          }
        }

        // Check if stop or limit was hit
        const hit = portfolio.checkStopLimit(openPos.dealId, bar.close);
        if (hit) {
          const trade = portfolio.closePosition(openPos.dealId, barInfo, hit);
          if (trade) {
            dailyPnl += trade.pnl;
            if (trade.pnl > 0) {
              cbState = recordWin(cbState, trade.pnl);
            } else {
              cbState = recordLoss(cbState, trade.pnl);
            }
          }
          // Skip signal processing for this epic this bar (position just closed)
          continue;
        }
      }

      if (skipNewSignals) continue;

      // -----------------------------------------------------------------
      // Run strategy signals
      // -----------------------------------------------------------------
      const openPosAfterStopCheck = portfolio.getOpenPositionForEpic(epic);
      const hasOpenPosition = openPosAfterStopCheck !== null;
      const openPositionDirection = openPosAfterStopCheck?.direction ?? null;

      const sentiment =
        config.sentiment?.[epic] ??
        (config.strategyName === "sentiment-contrarian"
          ? (() => {
              warnings.push(
                `No sentiment data provided for epic "${epic}" — sentiment-contrarian signal skipped.`,
              );
              return null;
            })()
          : null);

      const signals = runStrategy(
        config.strategyName,
        epic,
        candleWindow as Candle[],
        sentiment,
        strategyParams,
        hasOpenPosition,
        openPositionDirection,
      );

      for (const signal of signals) {
        // --- Exit signal ---
        if (
          signal.action === "close" &&
          hasOpenPosition &&
          openPosAfterStopCheck
        ) {
          const trade = portfolio.closePosition(
            openPosAfterStopCheck.dealId,
            barInfo,
            "signal",
          );
          if (trade) {
            dailyPnl += trade.pnl;
            if (trade.pnl > 0) {
              cbState = recordWin(cbState, trade.pnl);
            } else {
              cbState = recordLoss(cbState, trade.pnl);
            }
          }
          break; // Process one exit per instrument per bar
        }

        // --- Entry signal ---
        if (
          (signal.action === "buy" || signal.action === "sell") &&
          !hasOpenPosition &&
          signal.suggestedStop !== null
        ) {
          const direction = signal.action === "buy" ? "BUY" : "SELL";
          const entryPrice =
            direction === "BUY"
              ? bar.close + config.spreadPips + config.slippagePips
              : bar.close - config.spreadPips - config.slippagePips;

          const sizing = calculatePositionSize(
            {
              accountBalance: portfolio.getEquity(),
              entryPrice,
              stopLevel: signal.suggestedStop,
              limitLevel: signal.suggestedLimit,
              direction,
              minDealSize: 1,
            },
            riskConfig,
            portfolio.getOpenPositionCount(),
            dailyPnl,
          );

          portfolio.openPosition(signal, sizing, barInfo);
          break; // One entry per instrument per bar
        }
      }
    }

    // -----------------------------------------------------------------------
    // Mark to market — snapshot equity after all per-instrument processing
    // -----------------------------------------------------------------------
    if (currentPrices.size > 0) {
      portfolio.markToMarket(currentPrices, {
        index: barIndex,
        closePrice: [...currentPrices.values()][0]!,
        timestamp: (() => {
          // Use timestamp from first available series at this bar
          for (const instrument of config.instruments) {
            const series = candleMap.get(instrument.epic);
            if (series && barIndex < series.length) {
              return series[barIndex]!.timestamp;
            }
          }
          return undefined;
        })(),
      });
      totalBarsProcessed++;
    }
  }

  // -------------------------------------------------------------------------
  // Force-close any remaining open positions at last bar close
  // -------------------------------------------------------------------------
  for (const pos of portfolio.getOpenPositions()) {
    const series = candleMap.get(pos.epic);
    if (!series || series.length === 0) continue;
    const lastBar = series[series.length - 1]!;
    portfolio.closePosition(
      pos.dealId,
      {
        index: series.length - 1,
        closePrice: lastBar.close,
        timestamp: lastBar.timestamp,
      },
      "forced_close",
    );
  }

  // -------------------------------------------------------------------------
  // Compute metrics
  // -------------------------------------------------------------------------
  const trades = portfolio.getTradeHistory();
  const equityCurve = portfolio.getEquityCurve();

  const metrics = computeMetrics(
    trades,
    equityCurve,
    config.startingCapital,
    totalBarsProcessed,
  );

  const completedAt = new Date();
  const durationMs = completedAt.getTime() - startedAt.getTime();

  // -------------------------------------------------------------------------
  // Persist results to DB (if available)
  // -------------------------------------------------------------------------
  if (db && runId !== undefined) {
    // Update run record with final metrics
    await updateBacktestRun(db, runId, {
      status: "completed",
      metrics,
      warnings,
      totalTrades: trades.length,
      totalBars: totalBarsProcessed,
      durationMs,
      completedAt,
    });

    // Persist trades (batch insert)
    if (trades.length > 0) {
      await insertBacktestTrades(
        db,
        trades.map((t) => ({
          runId: runId!,
          epic: t.epic,
          strategy: t.strategy,
          direction: t.direction,
          size: t.size,
          entryPrice: t.entryPrice,
          exitPrice: t.exitPrice,
          entryBar: t.entryBar,
          exitBar: t.exitBar,
          barsHeld: t.barsHeld,
          pnl: t.pnl,
          pnlPct: t.pnlPct,
          stopLevel: t.stopLevel,
          limitLevel: t.limitLevel,
          entrySignalData: t.entrySignalData,
          exitReason: t.exitReason,
          entryTimestamp: t.entryTimestamp,
          exitTimestamp: t.exitTimestamp,
        })),
      );
    }

    // Persist equity curve
    if (equityCurve.length > 0) {
      await insertBacktestEquity(
        db,
        equityCurve.map((pt) => ({
          runId: runId!,
          barIndex: pt.barIndex,
          timestamp: pt.timestamp,
          equity: pt.equity,
          cash: pt.cash,
          unrealizedPnl: pt.unrealizedPnl,
          drawdownPct: pt.drawdownPct,
          drawdownAmount: pt.drawdownAmount,
          openPositionCount: pt.openPositionCount,
        })),
      );
    }
  }

  // -------------------------------------------------------------------------
  // Build and return result
  // -------------------------------------------------------------------------
  const result: BacktestResult = {
    runId,
    config,
    metrics,
    trades: trades as BacktestTrade[],
    equityCurve,
    startedAt,
    completedAt,
    durationMs,
    warnings,
  };

  return result;
}

// ---------------------------------------------------------------------------
// Internal helper: get latest indicator snapshot without re-running full strategy
// ---------------------------------------------------------------------------

interface PartialIndicators {
  atr: number | null;
}

function getLastIndicators(
  candles: BacktestCandle[],
  params: StrategyParams,
): PartialIndicators {
  const indicators = calculateIndicators(candles as Candle[], {
    smaPeriodFast: params.smaPeriodFast,
    smaPeriodSlow: params.smaPeriodSlow,
    atrPeriod: params.atrPeriod,
  });
  return { atr: indicators.atr };
}
