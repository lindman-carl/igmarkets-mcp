/**
 * Backtest Portfolio — Virtual Position Tracker
 *
 * Simulates order fills and tracks P&L during a backtest.
 * All operations are pure in-memory state mutations — no I/O.
 *
 * Fill model:
 *   BUY entry:  fill at bar.close + (spread + slippage)
 *   SELL entry: fill at bar.close - (spread + slippage)
 *   BUY exit:   fill at bar.close - (spread + slippage)
 *   SELL exit:  fill at bar.close + (spread + slippage)
 *
 * This models the real-world cost of crossing the spread on both
 * entry and exit, plus additional slippage.
 */

import type { BacktestEquityPoint, BacktestTrade } from "./backtest-schemas.js";
import type { StrategySignal } from "./strategy-runner.js";
import type { SizingResult } from "./position-sizer.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** An open simulated position tracked by the virtual portfolio. */
export interface VirtualPosition {
  /** Unique ID (sequential within the run) */
  dealId: string;
  /** Instrument epic */
  epic: string;
  /** Strategy that opened this position */
  strategy: string;
  /** Direction */
  direction: "BUY" | "SELL";
  /** Position size */
  size: number;
  /** Entry fill price (already includes spread+slippage cost) */
  entryPrice: number;
  /** Current stop level */
  stopLevel: number | null;
  /** Current limit level */
  limitLevel: number | null;
  /** Bar index when opened */
  entryBar: number;
  /** Entry bar timestamp (for reporting) */
  entryTimestamp: Date | undefined;
  /** Indicator data from entry signal (for diagnostics) */
  entrySignalData: Record<string, unknown> | undefined;
  /** Current unrealised P&L (updated by markToMarket) */
  unrealizedPnl: number;
}

/** Bar descriptor passed to portfolio operations. */
export interface BarInfo {
  /** Bar index in the candle array */
  index: number;
  /** Bar close price (used for fills and M2M) */
  closePrice: number;
  /** Optional timestamp */
  timestamp?: Date;
}

// ---------------------------------------------------------------------------
// VirtualPortfolio
// ---------------------------------------------------------------------------

export class VirtualPortfolio {
  /** Available cash (starts at startingCapital) */
  private _cash: number;
  /** Total spread + slippage per trade entry/exit in price points */
  private readonly _executionCost: number;
  /** Open positions keyed by dealId */
  private readonly _openPositions: Map<string, VirtualPosition>;
  /** Closed trades (historical record) */
  private readonly _closedTrades: BacktestTrade[];
  /** Bar-by-bar equity curve */
  private readonly _equityCurve: BacktestEquityPoint[];
  /** Sequential counter for generating unique deal IDs */
  private _nextDealId: number;
  /** Peak equity seen so far (for drawdown calculation) */
  private _peakEquity: number;

  constructor({
    startingCapital,
    spreadPips = 1,
    slippagePips = 0.5,
  }: {
    startingCapital: number;
    spreadPips?: number;
    slippagePips?: number;
  }) {
    this._cash = startingCapital;
    this._executionCost = spreadPips + slippagePips;
    this._openPositions = new Map();
    this._closedTrades = [];
    this._equityCurve = [];
    this._nextDealId = 1;
    this._peakEquity = startingCapital;
  }

  // -------------------------------------------------------------------------
  // Accessors
  // -------------------------------------------------------------------------

  /** Available cash (not locked in positions). */
  get cash(): number {
    return this._cash;
  }

  /** Total equity = cash + sum of unrealised P&L. */
  getEquity(): number {
    let unrealized = 0;
    for (const pos of this._openPositions.values()) {
      unrealized += pos.unrealizedPnl;
    }
    return this._cash + unrealized;
  }

  /** Sum of unrealised P&L across all open positions. */
  getUnrealizedPnl(): number {
    let total = 0;
    for (const pos of this._openPositions.values()) {
      total += pos.unrealizedPnl;
    }
    return total;
  }

  /** All currently open positions. */
  getOpenPositions(): VirtualPosition[] {
    return [...this._openPositions.values()];
  }

  /** Number of currently open positions. */
  getOpenPositionCount(): number {
    return this._openPositions.size;
  }

  /** Find an open position by epic (first match). */
  getOpenPositionForEpic(epic: string): VirtualPosition | null {
    for (const pos of this._openPositions.values()) {
      if (pos.epic === epic) return pos;
    }
    return null;
  }

  /** All closed trades (oldest first). */
  getTradeHistory(): BacktestTrade[] {
    return [...this._closedTrades];
  }

  /** Bar-by-bar equity curve (oldest first). */
  getEquityCurve(): BacktestEquityPoint[] {
    return [...this._equityCurve];
  }

  // -------------------------------------------------------------------------
  // Open a position
  // -------------------------------------------------------------------------

  /**
   * Simulate opening a position at bar close price.
   *
   * Fill price:
   *   BUY  → closePrice + executionCost  (buying higher — costs more)
   *   SELL → closePrice - executionCost  (selling lower — costs more)
   *
   * @returns The created VirtualPosition, or null if rejected (no cash etc.)
   */
  openPosition(
    signal: StrategySignal,
    sizing: SizingResult,
    bar: BarInfo,
  ): VirtualPosition | null {
    if (!sizing.approved || sizing.size <= 0) return null;

    const direction = signal.action === "buy" ? "BUY" : "SELL";
    const fillPrice =
      direction === "BUY"
        ? bar.closePrice + this._executionCost
        : bar.closePrice - this._executionCost;

    // Basic cash check — we don't model margin, just prevent negative cash
    // (in practice the position sizer uses % risk, not full capital)
    if (this._cash <= 0) return null;

    const dealId = `bt-${this._nextDealId++}`;

    const position: VirtualPosition = {
      dealId,
      epic: signal.epic,
      strategy: signal.strategy,
      direction,
      size: sizing.size,
      entryPrice: fillPrice,
      stopLevel: signal.suggestedStop ?? null,
      limitLevel: signal.suggestedLimit ?? null,
      entryBar: bar.index,
      entryTimestamp: bar.timestamp,
      entrySignalData: signal.indicatorData as Record<string, unknown>,
      unrealizedPnl: 0,
    };

    this._openPositions.set(dealId, position);
    return position;
  }

  // -------------------------------------------------------------------------
  // Close a position
  // -------------------------------------------------------------------------

  /**
   * Close an open position and record the realised trade.
   *
   * Fill price:
   *   BUY close  → closePrice - executionCost  (selling a long)
   *   SELL close → closePrice + executionCost  (buying back a short)
   *
   * @returns The BacktestTrade record, or null if dealId not found.
   */
  closePosition(
    dealId: string,
    bar: BarInfo,
    exitReason: BacktestTrade["exitReason"],
    overrideExitPrice?: number,
  ): BacktestTrade | null {
    const pos = this._openPositions.get(dealId);
    if (!pos) return null;

    // Compute exit fill price
    let exitPrice: number;
    if (overrideExitPrice !== undefined) {
      exitPrice = overrideExitPrice;
    } else {
      exitPrice =
        pos.direction === "BUY"
          ? bar.closePrice - this._executionCost
          : bar.closePrice + this._executionCost;
    }

    // Realised P&L
    const pnl =
      pos.direction === "BUY"
        ? (exitPrice - pos.entryPrice) * pos.size
        : (pos.entryPrice - exitPrice) * pos.size;

    const pnlPct = (exitPrice - pos.entryPrice) / pos.entryPrice;
    const barsHeld = bar.index - pos.entryBar;

    // Update cash
    this._cash += pnl;

    const trade: BacktestTrade = {
      tradeIndex: this._closedTrades.length,
      epic: pos.epic,
      strategy: pos.strategy as BacktestTrade["strategy"],
      direction: pos.direction,
      size: pos.size,
      entryPrice: pos.entryPrice,
      exitPrice,
      entryBar: pos.entryBar,
      exitBar: bar.index,
      barsHeld,
      pnl,
      pnlPct,
      stopLevel: pos.stopLevel ?? undefined,
      limitLevel: pos.limitLevel ?? undefined,
      entrySignalData: pos.entrySignalData,
      exitReason,
      entryTimestamp: pos.entryTimestamp,
      exitTimestamp: bar.timestamp,
    };

    this._closedTrades.push(trade);
    this._openPositions.delete(dealId);

    return trade;
  }

  // -------------------------------------------------------------------------
  // Update stop on open position
  // -------------------------------------------------------------------------

  /**
   * Adjust the stop level on an open position (for trailing stop logic).
   */
  updateStop(dealId: string, newStop: number): void {
    const pos = this._openPositions.get(dealId);
    if (pos) {
      this._openPositions.set(dealId, { ...pos, stopLevel: newStop });
    }
  }

  // -------------------------------------------------------------------------
  // Mark to market
  // -------------------------------------------------------------------------

  /**
   * Update unrealised P&L for all open positions at the current bar price,
   * then record an equity curve snapshot.
   *
   * @param currentPrices - Map of epic → current close price
   * @param bar - Current bar info
   */
  markToMarket(
    currentPrices: Map<string, number>,
    bar: BarInfo,
  ): BacktestEquityPoint {
    // Update unrealised P&L for each position
    for (const [dealId, pos] of this._openPositions) {
      const price = currentPrices.get(pos.epic);
      if (price === undefined) continue;

      const unrealizedPnl =
        pos.direction === "BUY"
          ? (price - pos.entryPrice) * pos.size
          : (pos.entryPrice - price) * pos.size;

      this._openPositions.set(dealId, { ...pos, unrealizedPnl });
    }

    const equity = this.getEquity();
    const unrealizedPnl = this.getUnrealizedPnl();

    // Update peak for drawdown tracking
    if (equity > this._peakEquity) {
      this._peakEquity = equity;
    }

    const drawdownAmount = equity - this._peakEquity; // negative or zero
    const drawdownPct =
      this._peakEquity > 0 ? drawdownAmount / this._peakEquity : 0;

    const point: BacktestEquityPoint = {
      barIndex: bar.index,
      timestamp: bar.timestamp,
      equity,
      cash: this._cash,
      unrealizedPnl,
      drawdownPct,
      drawdownAmount,
      openPositionCount: this._openPositions.size,
    };

    this._equityCurve.push(point);
    return point;
  }

  // -------------------------------------------------------------------------
  // Stop / limit hit check
  // -------------------------------------------------------------------------

  /**
   * Check whether a position's stop or limit was hit on the given bar.
   * Uses bar close (conservative — no intra-bar checking in v1).
   *
   * @returns "stop" | "limit" | null
   */
  checkStopLimit(
    dealId: string,
    currentPrice: number,
  ): "stop" | "limit" | null {
    const pos = this._openPositions.get(dealId);
    if (!pos) return null;

    if (pos.direction === "BUY") {
      if (pos.stopLevel !== null && currentPrice <= pos.stopLevel)
        return "stop";
      if (pos.limitLevel !== null && currentPrice >= pos.limitLevel)
        return "limit";
    } else {
      if (pos.stopLevel !== null && currentPrice >= pos.stopLevel)
        return "stop";
      if (pos.limitLevel !== null && currentPrice <= pos.limitLevel)
        return "limit";
    }

    return null;
  }
}
