/**
 * Circuit Breaker — Trading Safety Guard
 *
 * Stops the bot from trading when:
 * 1. Too many consecutive losses
 * 2. Too many consecutive API errors
 * 3. Daily loss limit exceeded
 *
 * The circuit breaker "trips" and enters a cooldown period.
 * After the cooldown, it resets and allows trading again.
 */

import type { CircuitBreakerConfig, CircuitBreakerState } from "./schemas.js";
import {
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_STATE,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Result of checking the circuit breaker. */
export interface CircuitBreakerCheck {
  /** Whether trading is allowed */
  canTrade: boolean;
  /** Reason if trading is blocked */
  reason: string | null;
  /** Current state after the check */
  state: CircuitBreakerState;
}

// ---------------------------------------------------------------------------
// Check
// ---------------------------------------------------------------------------

/**
 * Check whether the circuit breaker allows trading.
 *
 * @param state - Current circuit breaker state
 * @param config - Circuit breaker configuration
 * @param accountBalance - Current account balance (for daily loss % check)
 * @returns Check result with canTrade flag and updated state
 */
export function checkCircuitBreaker(
  state: CircuitBreakerState,
  config: CircuitBreakerConfig = DEFAULT_CIRCUIT_BREAKER_CONFIG,
  accountBalance = 0,
): CircuitBreakerCheck {
  // Check if in cooldown
  if (state.tripped && state.cooldownUntil) {
    const now = new Date();
    const cooldownEnd = new Date(state.cooldownUntil);

    if (now < cooldownEnd) {
      const minutesLeft = Math.ceil(
        (cooldownEnd.getTime() - now.getTime()) / 60000,
      );
      return {
        canTrade: false,
        reason: `Circuit breaker tripped. Cooldown: ${minutesLeft} minutes remaining`,
        state,
      };
    }

    // Cooldown expired — reset
    return {
      canTrade: true,
      reason: null,
      state: { ...DEFAULT_CIRCUIT_BREAKER_STATE },
    };
  }

  // Check consecutive losses
  if (state.consecutiveLosses >= config.maxConsecutiveLosses) {
    const trippedState = tripBreaker(state, config, "consecutive_losses");
    return {
      canTrade: false,
      reason: `Circuit breaker: ${state.consecutiveLosses} consecutive losses (max: ${config.maxConsecutiveLosses})`,
      state: trippedState,
    };
  }

  // Check consecutive errors
  if (state.consecutiveErrors >= config.maxConsecutiveErrors) {
    const trippedState = tripBreaker(state, config, "consecutive_errors");
    return {
      canTrade: false,
      reason: `Circuit breaker: ${state.consecutiveErrors} consecutive errors (max: ${config.maxConsecutiveErrors})`,
      state: trippedState,
    };
  }

  // Check daily loss limit
  if (accountBalance > 0) {
    const maxDailyLoss = accountBalance * config.maxDailyLossPct;
    if (state.dailyPnl < 0 && Math.abs(state.dailyPnl) >= maxDailyLoss) {
      const trippedState = tripBreaker(state, config, "daily_loss_limit");
      return {
        canTrade: false,
        reason: `Circuit breaker: daily loss limit reached (${state.dailyPnl.toFixed(2)} / -${maxDailyLoss.toFixed(2)})`,
        state: trippedState,
      };
    }
  }

  return {
    canTrade: true,
    reason: null,
    state,
  };
}

// ---------------------------------------------------------------------------
// State Updates
// ---------------------------------------------------------------------------

/**
 * Record a winning trade.
 */
export function recordWin(
  state: CircuitBreakerState,
  pnl: number,
): CircuitBreakerState {
  return {
    ...state,
    consecutiveLosses: 0, // Reset on win
    dailyPnl: state.dailyPnl + pnl,
  };
}

/**
 * Record a losing trade.
 */
export function recordLoss(
  state: CircuitBreakerState,
  pnl: number,
): CircuitBreakerState {
  return {
    ...state,
    consecutiveLosses: state.consecutiveLosses + 1,
    totalLossesToday: state.totalLossesToday + 1,
    dailyPnl: state.dailyPnl + pnl,
  };
}

/**
 * Record an API or execution error.
 */
export function recordError(state: CircuitBreakerState): CircuitBreakerState {
  return {
    ...state,
    consecutiveErrors: state.consecutiveErrors + 1,
  };
}

/**
 * Record a successful API call (resets error counter).
 */
export function recordSuccess(state: CircuitBreakerState): CircuitBreakerState {
  return {
    ...state,
    consecutiveErrors: 0,
  };
}

/**
 * Reset daily counters (call at the start of each trading day).
 */
export function resetDaily(state: CircuitBreakerState): CircuitBreakerState {
  return {
    ...state,
    totalLossesToday: 0,
    dailyPnl: 0,
    // Don't reset tripped/cooldown — those persist
  };
}

/**
 * Fully reset the circuit breaker (e.g. manual override).
 */
export function resetCircuitBreaker(): CircuitBreakerState {
  return { ...DEFAULT_CIRCUIT_BREAKER_STATE };
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

function tripBreaker(
  state: CircuitBreakerState,
  config: CircuitBreakerConfig,
  _reason: string,
): CircuitBreakerState {
  const now = new Date();
  const cooldownEnd = new Date(now.getTime() + config.cooldownMinutes * 60000);

  return {
    ...state,
    tripped: true,
    lastTrippedAt: now.toISOString(),
    cooldownUntil: cooldownEnd.toISOString(),
  };
}
