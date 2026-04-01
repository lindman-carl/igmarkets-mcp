import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  checkCircuitBreaker,
  recordWin,
  recordLoss,
  recordError,
  recordSuccess,
  resetDaily,
  resetCircuitBreaker,
} from "./circuit-breaker.js";
import type { CircuitBreakerConfig, CircuitBreakerState } from "./schemas.js";
import {
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_STATE,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeState(
  overrides: Partial<CircuitBreakerState> = {},
): CircuitBreakerState {
  return { ...DEFAULT_CIRCUIT_BREAKER_STATE, ...overrides };
}

const CONFIG: CircuitBreakerConfig = {
  maxConsecutiveLosses: 3,
  maxConsecutiveErrors: 5,
  cooldownMinutes: 60,
  maxDailyLossPct: 0.05,
};

// ---------------------------------------------------------------------------
// checkCircuitBreaker
// ---------------------------------------------------------------------------

describe("checkCircuitBreaker", () => {
  it("allows trading in clean state", () => {
    const result = checkCircuitBreaker(makeState(), CONFIG);
    expect(result.canTrade).toBe(true);
    expect(result.reason).toBeNull();
  });

  it("blocks when consecutive losses reach max", () => {
    const state = makeState({ consecutiveLosses: 3 });
    const result = checkCircuitBreaker(state, CONFIG);
    expect(result.canTrade).toBe(false);
    expect(result.reason).toMatch(/consecutive losses/i);
  });

  it("blocks when consecutive errors reach max", () => {
    const state = makeState({ consecutiveErrors: 5 });
    const result = checkCircuitBreaker(state, CONFIG);
    expect(result.canTrade).toBe(false);
    expect(result.reason).toMatch(/consecutive errors/i);
  });

  it("blocks when daily loss limit reached", () => {
    // 5% of 10,000 = 500
    const state = makeState({ dailyPnl: -500 });
    const result = checkCircuitBreaker(state, CONFIG, 10_000);
    expect(result.canTrade).toBe(false);
    expect(result.reason).toMatch(/daily loss/i);
  });

  it("does not check daily loss when accountBalance is 0", () => {
    const state = makeState({ dailyPnl: -99999 });
    const result = checkCircuitBreaker(state, CONFIG, 0);
    expect(result.canTrade).toBe(true);
  });

  it("allows trading when dailyPnl is just below limit", () => {
    const state = makeState({ dailyPnl: -499 });
    const result = checkCircuitBreaker(state, CONFIG, 10_000);
    expect(result.canTrade).toBe(true);
  });

  describe("cooldown", () => {
    afterEach(() => vi.useRealTimers());

    it("blocks when in active cooldown", () => {
      const future = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min from now
      const state = makeState({ tripped: true, cooldownUntil: future });
      const result = checkCircuitBreaker(state, CONFIG);
      expect(result.canTrade).toBe(false);
      expect(result.reason).toMatch(/cooldown/i);
    });

    it("resets and allows trading after cooldown expires", () => {
      const past = new Date(Date.now() - 1000).toISOString(); // 1 second ago
      const state = makeState({ tripped: true, cooldownUntil: past });
      const result = checkCircuitBreaker(state, CONFIG);
      expect(result.canTrade).toBe(true);
      expect(result.state.tripped).toBe(false);
      expect(result.state.consecutiveLosses).toBe(0);
    });

    it("sets cooldownUntil when tripped by losses", () => {
      const state = makeState({ consecutiveLosses: 3 });
      const result = checkCircuitBreaker(state, CONFIG);
      expect(result.state.tripped).toBe(true);
      expect(result.state.cooldownUntil).not.toBeNull();
    });
  });
});

// ---------------------------------------------------------------------------
// recordWin
// ---------------------------------------------------------------------------

describe("recordWin", () => {
  it("resets consecutiveLosses to 0", () => {
    const state = makeState({ consecutiveLosses: 2 });
    const next = recordWin(state, 50);
    expect(next.consecutiveLosses).toBe(0);
  });

  it("adds pnl to dailyPnl", () => {
    const state = makeState({ dailyPnl: 100 });
    const next = recordWin(state, 75);
    expect(next.dailyPnl).toBeCloseTo(175);
  });

  it("does not modify other fields", () => {
    const state = makeState({ consecutiveErrors: 2, totalLossesToday: 1 });
    const next = recordWin(state, 50);
    expect(next.consecutiveErrors).toBe(2);
    expect(next.totalLossesToday).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// recordLoss
// ---------------------------------------------------------------------------

describe("recordLoss", () => {
  it("increments consecutiveLosses", () => {
    const state = makeState({ consecutiveLosses: 1 });
    const next = recordLoss(state, -50);
    expect(next.consecutiveLosses).toBe(2);
  });

  it("increments totalLossesToday", () => {
    const state = makeState({ totalLossesToday: 3 });
    const next = recordLoss(state, -50);
    expect(next.totalLossesToday).toBe(4);
  });

  it("adds (negative) pnl to dailyPnl", () => {
    const state = makeState({ dailyPnl: -100 });
    const next = recordLoss(state, -50);
    expect(next.dailyPnl).toBeCloseTo(-150);
  });

  it("does not reset consecutiveErrors", () => {
    const state = makeState({ consecutiveErrors: 3 });
    const next = recordLoss(state, -50);
    expect(next.consecutiveErrors).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// recordError / recordSuccess
// ---------------------------------------------------------------------------

describe("recordError", () => {
  it("increments consecutiveErrors", () => {
    const state = makeState({ consecutiveErrors: 2 });
    expect(recordError(state).consecutiveErrors).toBe(3);
  });

  it("does not affect other counters", () => {
    const state = makeState({ consecutiveLosses: 1 });
    const next = recordError(state);
    expect(next.consecutiveLosses).toBe(1);
  });
});

describe("recordSuccess", () => {
  it("resets consecutiveErrors to 0", () => {
    const state = makeState({ consecutiveErrors: 4 });
    expect(recordSuccess(state).consecutiveErrors).toBe(0);
  });

  it("does not affect loss counters", () => {
    const state = makeState({ consecutiveLosses: 2 });
    expect(recordSuccess(state).consecutiveLosses).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// resetDaily
// ---------------------------------------------------------------------------

describe("resetDaily", () => {
  it("resets totalLossesToday and dailyPnl", () => {
    const state = makeState({ totalLossesToday: 3, dailyPnl: -200 });
    const next = resetDaily(state);
    expect(next.totalLossesToday).toBe(0);
    expect(next.dailyPnl).toBe(0);
  });

  it("preserves tripped state and cooldown", () => {
    const future = new Date(Date.now() + 3600_000).toISOString();
    const state = makeState({
      tripped: true,
      cooldownUntil: future,
      consecutiveLosses: 3,
    });
    const next = resetDaily(state);
    expect(next.tripped).toBe(true);
    expect(next.cooldownUntil).toBe(future);
    expect(next.consecutiveLosses).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// resetCircuitBreaker
// ---------------------------------------------------------------------------

describe("resetCircuitBreaker", () => {
  it("returns default state", () => {
    const state = resetCircuitBreaker();
    expect(state).toEqual(DEFAULT_CIRCUIT_BREAKER_STATE);
  });

  it("clears tripped and cooldown", () => {
    const state = resetCircuitBreaker();
    expect(state.tripped).toBe(false);
    expect(state.cooldownUntil).toBeNull();
    expect(state.consecutiveLosses).toBe(0);
    expect(state.consecutiveErrors).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// State transition integration (win/loss sequences)
// ---------------------------------------------------------------------------

describe("circuit breaker – state transitions", () => {
  it("win after losses resets the loss counter", () => {
    let state = makeState();
    state = recordLoss(state, -50);
    state = recordLoss(state, -50);
    state = recordWin(state, 100);
    expect(state.consecutiveLosses).toBe(0);
  });

  it("3 consecutive losses trips the breaker on next check", () => {
    let state = makeState();
    state = recordLoss(state, -50);
    state = recordLoss(state, -50);
    state = recordLoss(state, -50);
    const result = checkCircuitBreaker(state, CONFIG);
    expect(result.canTrade).toBe(false);
  });

  it("5 consecutive errors trips the breaker on next check", () => {
    let state = makeState();
    for (let i = 0; i < 5; i++) {
      state = recordError(state);
    }
    const result = checkCircuitBreaker(state, CONFIG);
    expect(result.canTrade).toBe(false);
    expect(result.reason).toMatch(/consecutive errors/i);
  });
});
