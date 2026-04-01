/**
 * Position Sizer — Risk-Based Position Sizing
 *
 * Calculates position size based on:
 * - Account balance
 * - Risk per trade (% of account)
 * - Stop distance (difference between entry and stop)
 * - Value per point (from IG instrument details)
 *
 * Formula:
 *   risk_amount = account_balance × risk_percentage
 *   position_size = risk_amount / (stop_distance × value_per_point)
 *
 * Also validates risk/reward ratio before allowing the trade.
 */

import type { RiskConfig } from "./schemas.js";
import { DEFAULT_RISK_CONFIG } from "./schemas.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters needed to calculate position size. */
export interface SizingInput {
  /** Account balance in account currency */
  accountBalance: number;
  /** Entry price */
  entryPrice: number;
  /** Stop loss price */
  stopLevel: number;
  /** Take profit price (for R:R check) */
  limitLevel: number | null;
  /** Direction: "BUY" or "SELL" */
  direction: "BUY" | "SELL";
  /** Minimum deal size from IG instrument details */
  minDealSize: number;
  /** Value per point / per unit from IG instrument details */
  valuePerPoint?: number;
}

/** Result of position sizing calculation. */
export interface SizingResult {
  /** Calculated position size */
  size: number;
  /** Risk amount in account currency */
  riskAmount: number;
  /** Stop distance in points */
  stopDistance: number;
  /** Risk/reward ratio (e.g. 2.0 means 1:2) */
  riskRewardRatio: number | null;
  /** Whether the trade passes risk/reward minimum */
  passesRiskReward: boolean;
  /** Whether the trade passes overall risk checks */
  approved: boolean;
  /** Reason if not approved */
  rejectReason: string | null;
}

// ---------------------------------------------------------------------------
// Sizing Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate position size based on risk parameters.
 *
 * @param input - Sizing parameters
 * @param riskConfig - Risk configuration (defaults applied)
 * @param currentOpenPositions - Number of currently open positions
 * @param dailyPnl - Today's realized P&L (negative = losses)
 * @returns SizingResult with calculated size and approval status
 */
export function calculatePositionSize(
  input: SizingInput,
  riskConfig: RiskConfig = DEFAULT_RISK_CONFIG,
  currentOpenPositions = 0,
  dailyPnl = 0,
): SizingResult {
  const {
    accountBalance,
    entryPrice,
    stopLevel,
    limitLevel,
    direction,
    minDealSize,
    valuePerPoint = 1,
  } = input;

  // --- Calculate stop distance ---
  const stopDistance =
    direction === "BUY" ? entryPrice - stopLevel : stopLevel - entryPrice;

  if (stopDistance <= 0) {
    return {
      size: 0,
      riskAmount: 0,
      stopDistance: 0,
      riskRewardRatio: null,
      passesRiskReward: false,
      approved: false,
      rejectReason:
        "Invalid stop level: stop must be on the loss side of entry",
    };
  }

  // --- Calculate risk amount ---
  const riskAmount = accountBalance * riskConfig.maxRiskPerTradePct;

  // --- Calculate position size ---
  let size = riskAmount / (stopDistance * valuePerPoint);

  // Enforce minimum deal size
  if (size < minDealSize) {
    size = minDealSize;
  }

  // Round to 2 decimal places (IG supports fractional sizes for some instruments)
  size = Math.round(size * 100) / 100;

  // --- Calculate risk/reward ratio ---
  let riskRewardRatio: number | null = null;
  let passesRiskReward = true;

  if (limitLevel !== null) {
    const rewardDistance =
      direction === "BUY" ? limitLevel - entryPrice : entryPrice - limitLevel;

    if (rewardDistance > 0 && stopDistance > 0) {
      riskRewardRatio = rewardDistance / stopDistance;
      passesRiskReward = riskRewardRatio >= 1.5; // Minimum 1:1.5
    } else {
      passesRiskReward = false;
    }
  }

  // --- Check position count limit ---
  if (currentOpenPositions >= riskConfig.maxOpenPositions) {
    return {
      size,
      riskAmount,
      stopDistance,
      riskRewardRatio,
      passesRiskReward,
      approved: false,
      rejectReason: `Max open positions reached (${currentOpenPositions}/${riskConfig.maxOpenPositions})`,
    };
  }

  // --- Check daily loss limit ---
  const maxDailyLoss = accountBalance * riskConfig.maxDailyLossPct;
  if (dailyPnl < 0 && Math.abs(dailyPnl) >= maxDailyLoss) {
    return {
      size,
      riskAmount,
      stopDistance,
      riskRewardRatio,
      passesRiskReward,
      approved: false,
      rejectReason: `Daily loss limit reached (${dailyPnl.toFixed(2)} / -${maxDailyLoss.toFixed(2)})`,
    };
  }

  // --- Check risk/reward ---
  if (!passesRiskReward && limitLevel !== null) {
    return {
      size,
      riskAmount,
      stopDistance,
      riskRewardRatio,
      passesRiskReward,
      approved: false,
      rejectReason: `Risk/reward ratio too low (${riskRewardRatio?.toFixed(2) ?? "N/A"}, min 1.5)`,
    };
  }

  return {
    size,
    riskAmount,
    stopDistance,
    riskRewardRatio,
    passesRiskReward,
    approved: true,
    rejectReason: null,
  };
}

// ---------------------------------------------------------------------------
// Trailing Stop Calculation
// ---------------------------------------------------------------------------

/**
 * Calculate whether a trailing stop should be adjusted.
 *
 * Rules (from risk-management skill):
 * - After 1x ATR profit: move stop to break-even (entry price)
 * - After 2x ATR profit: trail stop at 1x ATR below current price
 *
 * @param direction - Position direction
 * @param entryPrice - Original entry price
 * @param currentPrice - Current market price
 * @param currentStop - Current stop level
 * @param atr - Current ATR value
 * @returns New stop level, or null if no adjustment needed
 */
export function calculateTrailingStop(
  direction: "BUY" | "SELL",
  entryPrice: number,
  currentPrice: number,
  currentStop: number,
  atr: number,
): number | null {
  const profitDistance =
    direction === "BUY" ? currentPrice - entryPrice : entryPrice - currentPrice;

  if (profitDistance <= 0) return null; // Not in profit

  // After 2x ATR profit: trail at 1x ATR
  if (profitDistance >= 2 * atr) {
    const trailedStop =
      direction === "BUY" ? currentPrice - atr : currentPrice + atr;

    // Only move stop in the profitable direction
    if (direction === "BUY" && trailedStop > currentStop) {
      return trailedStop;
    }
    if (direction === "SELL" && trailedStop < currentStop) {
      return trailedStop;
    }
  }

  // After 1x ATR profit: move to break-even
  if (profitDistance >= atr) {
    if (direction === "BUY" && currentStop < entryPrice) {
      return entryPrice;
    }
    if (direction === "SELL" && currentStop > entryPrice) {
      return entryPrice;
    }
  }

  return null; // No adjustment
}
