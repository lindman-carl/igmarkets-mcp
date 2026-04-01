/**
 * Zod v4 Schemas - Trading Bot Domain Types
 *
 * These schemas define the domain types for the trading bot and serve as
 * the validation layer for data flowing in/out of the persistence layer.
 *
 * Convention: schemas are named with a Schema suffix, inferred types without.
 */

import { z } from "zod/v4";

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const TickStatusSchema = z.enum([
  "running",
  "completed",
  "skipped",
  "error",
]);
export type TickStatus = z.infer<typeof TickStatusSchema>;

export const SignalActionSchema = z.enum(["buy", "sell", "close", "hold"]);
export type SignalAction = z.infer<typeof SignalActionSchema>;

export const SignalTypeSchema = z.enum(["entry", "exit", "adjust"]);
export type SignalType = z.infer<typeof SignalTypeSchema>;

export const StrategyNameSchema = z.enum([
  "trend-following",
  "breakout",
  "mean-reversion",
  "sentiment-contrarian",
]);
export type StrategyName = z.infer<typeof StrategyNameSchema>;

export const DirectionSchema = z.enum(["BUY", "SELL"]);
export type Direction = z.infer<typeof DirectionSchema>;

export const OrderTypeSchema = z.enum(["MARKET", "LIMIT", "STOP"]);
export type OrderType = z.infer<typeof OrderTypeSchema>;

export const TradeStatusSchema = z.enum(["OPEN", "REJECTED", "PENDING"]);
export type TradeStatus = z.infer<typeof TradeStatusSchema>;

export const PositionStatusSchema = z.enum(["open", "closed", "unknown"]);
export type PositionStatus = z.infer<typeof PositionStatusSchema>;

// ---------------------------------------------------------------------------
// Indicator Data (stored as JSON in signals)
// ---------------------------------------------------------------------------

export const IndicatorDataSchema = z.object({
  smaFast: z.optional(z.number()),
  smaSlow: z.optional(z.number()),
  atr: z.optional(z.number()),
  bollingerUpper: z.optional(z.number()),
  bollingerLower: z.optional(z.number()),
  bollingerMiddle: z.optional(z.number()),
  sentimentLongPct: z.optional(z.number()),
  sentimentShortPct: z.optional(z.number()),
  currentPrice: z.optional(z.number()),
  dayHigh: z.optional(z.number()),
  dayLow: z.optional(z.number()),
});
export type IndicatorData = z.infer<typeof IndicatorDataSchema>;

// ---------------------------------------------------------------------------
// Tick
// ---------------------------------------------------------------------------

export const TickSchema = z.object({
  id: z.optional(z.number()),
  startedAt: z.string(),
  completedAt: z.optional(z.nullable(z.string())),
  status: TickStatusSchema,
  instrumentsScanned: z.optional(z.number()),
  signalsGenerated: z.optional(z.number()),
  tradesExecuted: z.optional(z.number()),
  error: z.optional(z.nullable(z.string())),
  metadata: z.optional(z.nullable(z.unknown())),
});
export type Tick = z.infer<typeof TickSchema>;

export const InsertTickSchema = z.object({
  startedAt: z.string(),
  status: TickStatusSchema.default("running"),
  metadata: z.optional(z.unknown()),
});
export type InsertTick = z.infer<typeof InsertTickSchema>;

// ---------------------------------------------------------------------------
// Signal
// ---------------------------------------------------------------------------

export const SignalSchema = z.object({
  id: z.optional(z.number()),
  tickId: z.number(),
  epic: z.string(),
  strategy: StrategyNameSchema,
  action: SignalActionSchema,
  signalType: SignalTypeSchema,
  confidence: z.optional(z.nullable(z.number())),
  priceAtSignal: z.optional(z.nullable(z.number())),
  suggestedStop: z.optional(z.nullable(z.number())),
  suggestedLimit: z.optional(z.nullable(z.number())),
  suggestedSize: z.optional(z.nullable(z.number())),
  acted: z.optional(z.boolean()),
  skipReason: z.optional(z.nullable(z.string())),
  createdAt: z.string(),
  indicatorData: z.optional(z.nullable(IndicatorDataSchema)),
});
export type Signal = z.infer<typeof SignalSchema>;

export const InsertSignalSchema = z.object({
  tickId: z.number(),
  epic: z.string(),
  strategy: StrategyNameSchema,
  action: SignalActionSchema,
  signalType: SignalTypeSchema,
  confidence: z.optional(z.number()),
  priceAtSignal: z.optional(z.number()),
  suggestedStop: z.optional(z.number()),
  suggestedLimit: z.optional(z.number()),
  suggestedSize: z.optional(z.number()),
  acted: z.optional(z.boolean()),
  skipReason: z.optional(z.string()),
  createdAt: z.string(),
  indicatorData: z.optional(IndicatorDataSchema),
});
export type InsertSignal = z.infer<typeof InsertSignalSchema>;

// ---------------------------------------------------------------------------
// Trade
// ---------------------------------------------------------------------------

export const TradeSchema = z.object({
  id: z.optional(z.number()),
  tickId: z.number(),
  signalId: z.optional(z.nullable(z.number())),
  dealReference: z.optional(z.nullable(z.string())),
  dealId: z.optional(z.nullable(z.string())),
  epic: z.string(),
  direction: DirectionSchema,
  size: z.number().positive(),
  orderType: OrderTypeSchema,
  executionPrice: z.optional(z.nullable(z.number())),
  stopLevel: z.optional(z.nullable(z.number())),
  limitLevel: z.optional(z.nullable(z.number())),
  status: TradeStatusSchema.default("PENDING"),
  rejectReason: z.optional(z.nullable(z.string())),
  currencyCode: z.string(),
  expiry: z.string(),
  createdAt: z.string(),
  confirmationData: z.optional(z.nullable(z.unknown())),
});
export type Trade = z.infer<typeof TradeSchema>;

export const InsertTradeSchema = z.object({
  tickId: z.number(),
  signalId: z.optional(z.number()),
  dealReference: z.optional(z.string()),
  dealId: z.optional(z.string()),
  epic: z.string(),
  direction: DirectionSchema,
  size: z.number().positive(),
  orderType: OrderTypeSchema,
  executionPrice: z.optional(z.number()),
  stopLevel: z.optional(z.number()),
  limitLevel: z.optional(z.number()),
  status: TradeStatusSchema.default("PENDING"),
  rejectReason: z.optional(z.string()),
  currencyCode: z.string(),
  expiry: z.string(),
  createdAt: z.string(),
  confirmationData: z.optional(z.unknown()),
});
export type InsertTrade = z.infer<typeof InsertTradeSchema>;

// ---------------------------------------------------------------------------
// Position (tracked by bot)
// ---------------------------------------------------------------------------

export const PositionSchema = z.object({
  id: z.optional(z.number()),
  dealId: z.string(),
  epic: z.string(),
  direction: DirectionSchema,
  size: z.number().positive(),
  entryPrice: z.number(),
  currentStop: z.optional(z.nullable(z.number())),
  currentLimit: z.optional(z.nullable(z.number())),
  strategy: z.optional(z.nullable(z.string())),
  status: PositionStatusSchema.default("open"),
  exitPrice: z.optional(z.nullable(z.number())),
  realizedPnl: z.optional(z.nullable(z.number())),
  currencyCode: z.string(),
  expiry: z.string(),
  openedAt: z.string(),
  closedAt: z.optional(z.nullable(z.string())),
  openTradeId: z.optional(z.nullable(z.number())),
  closeTradeId: z.optional(z.nullable(z.number())),
  metadata: z.optional(z.nullable(z.unknown())),
});
export type Position = z.infer<typeof PositionSchema>;

export const InsertPositionSchema = z.object({
  dealId: z.string(),
  epic: z.string(),
  direction: DirectionSchema,
  size: z.number().positive(),
  entryPrice: z.number(),
  currentStop: z.optional(z.number()),
  currentLimit: z.optional(z.number()),
  strategy: z.optional(z.string()),
  status: PositionStatusSchema.default("open"),
  currencyCode: z.string(),
  expiry: z.string(),
  openedAt: z.string(),
  openTradeId: z.optional(z.number()),
  metadata: z.optional(z.unknown()),
});
export type InsertPosition = z.infer<typeof InsertPositionSchema>;

// ---------------------------------------------------------------------------
// Bot State (key-value)
// ---------------------------------------------------------------------------

export const BotStateEntrySchema = z.object({
  key: z.string(),
  value: z.unknown(),
  updatedAt: z.string(),
});
export type BotStateEntry = z.infer<typeof BotStateEntrySchema>;

// ---------------------------------------------------------------------------
// Circuit Breaker State (stored in bot_state table)
// ---------------------------------------------------------------------------

export const CircuitBreakerStateSchema = z.object({
  tripped: z.boolean(),
  consecutiveLosses: z.number(),
  consecutiveErrors: z.number(),
  lastTrippedAt: z.optional(z.nullable(z.string())),
  cooldownUntil: z.optional(z.nullable(z.string())),
  totalLossesToday: z.number(),
  dailyPnl: z.number(),
});
export type CircuitBreakerState = z.infer<typeof CircuitBreakerStateSchema>;

export const DEFAULT_CIRCUIT_BREAKER_STATE: CircuitBreakerState = {
  tripped: false,
  consecutiveLosses: 0,
  consecutiveErrors: 0,
  lastTrippedAt: null,
  cooldownUntil: null,
  totalLossesToday: 0,
  dailyPnl: 0,
};

// ---------------------------------------------------------------------------
// Bot Configuration
// ---------------------------------------------------------------------------

export const WatchlistItemSchema = z.object({
  epic: z.string(),
  expiry: z.string(),
  currencyCode: z.string(),
});
export type WatchlistItem = z.infer<typeof WatchlistItemSchema>;

export const StrategyParamsSchema = z.object({
  smaPeriodFast: z.number().int().positive().default(10),
  smaPeriodSlow: z.number().int().positive().default(20),
  atrPeriod: z.number().int().positive().default(14),
  atrStopMultiplier: z.number().positive().default(1.5),
  atrTargetMultiplier: z.number().positive().default(3.0),
});
export type StrategyParams = z.infer<typeof StrategyParamsSchema>;

export const RiskConfigSchema = z.object({
  /** Max risk per trade as fraction of account (e.g. 0.01 = 1%) */
  maxRiskPerTradePct: z.number().positive().max(0.1).default(0.01),
  maxOpenPositions: z.number().int().positive().default(5),
  /** Max daily loss as fraction of account (e.g. 0.03 = 3%) */
  maxDailyLossPct: z.number().positive().max(0.2).default(0.03),
  /** Max margin utilization as fraction (e.g. 0.5 = 50%) */
  maxMarginUtilPct: z.number().positive().max(1.0).default(0.5),
  useGuaranteedStops: z.boolean().default(false),
});
export type RiskConfig = z.infer<typeof RiskConfigSchema>;

export const CircuitBreakerConfigSchema = z.object({
  maxConsecutiveLosses: z.number().int().positive().default(3),
  maxConsecutiveErrors: z.number().int().positive().default(5),
  /** Cooldown in minutes after circuit breaker trips */
  cooldownMinutes: z.number().int().positive().default(60),
  /** Max daily loss as fraction of account to trip breaker */
  maxDailyLossPct: z.number().positive().max(0.2).default(0.05),
});
export type CircuitBreakerConfig = z.infer<typeof CircuitBreakerConfigSchema>;

// ---------------------------------------------------------------------------
// Strategy Prompt Frontmatter (parsed from YAML header in prompt markdown)
// ---------------------------------------------------------------------------

export const StrategyPromptFrontmatterSchema = z.object({
  /** Display name (optional, strategy.name is canonical) */
  name: z.optional(z.string()),
  /** Tickers to trade — overrides watchlist when present */
  tickers: z.optional(z.array(WatchlistItemSchema)),
  /** Base strategy type */
  strategyType: z.optional(z.string()),
  /** Risk per trade override (fraction, e.g. 0.01 = 1%) */
  riskPerTrade: z.optional(z.number().positive().max(0.1)),
  /** Max open positions override */
  maxOpenPositions: z.optional(z.number().int().positive()),
  /** Strategy parameter overrides */
  strategyParams: z.optional(StrategyParamsSchema),
});
export type StrategyPromptFrontmatter = z.infer<
  typeof StrategyPromptFrontmatterSchema
>;

/** Result of parsing a strategy prompt's markdown content. */
export interface ParsedStrategyPrompt {
  /** Parsed and validated frontmatter metadata */
  frontmatter: StrategyPromptFrontmatter;
  /** The markdown body (everything after the frontmatter) */
  body: string;
}

// ---------------------------------------------------------------------------
// Strategy (persisted in strategies table)
// ---------------------------------------------------------------------------

export const StrategySchema = z.object({
  id: z.optional(z.number()),
  name: z.string().min(1),
  prompt: z.string(),
  strategyType: z.string(),
  strategyParams: z.optional(z.nullable(z.unknown())),
  riskConfig: z.optional(z.nullable(z.unknown())),
  isActive: z.optional(z.boolean()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Strategy = z.infer<typeof StrategySchema>;

export const InsertStrategySchema = z.object({
  name: z.string().min(1),
  prompt: z.string(),
  strategyType: z.string(),
  strategyParams: z.optional(z.unknown()),
  riskConfig: z.optional(z.unknown()),
  isActive: z.optional(z.boolean()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InsertStrategy = z.infer<typeof InsertStrategySchema>;

// ---------------------------------------------------------------------------
// Account (persisted in accounts table)
// ---------------------------------------------------------------------------

export const AccountSchema = z.object({
  id: z.optional(z.number()),
  name: z.string().min(1),
  igApiKey: z.string(),
  igUsername: z.string(),
  igPassword: z.string(),
  isDemo: z.optional(z.boolean()),
  strategyId: z.number(),
  intervalMinutes: z.optional(z.number().int()),
  timezone: z.optional(z.string()),
  isActive: z.optional(z.boolean()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Account = z.infer<typeof AccountSchema>;

export const InsertAccountSchema = z.object({
  name: z.string().min(1),
  igApiKey: z.string(),
  igUsername: z.string(),
  igPassword: z.string(),
  isDemo: z.optional(z.boolean()),
  strategyId: z.number(),
  intervalMinutes: z.optional(z.number().int()),
  timezone: z.optional(z.string()),
  isActive: z.optional(z.boolean()),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type InsertAccount = z.infer<typeof InsertAccountSchema>;

export const BotConfigSchema = z.object({
  /** Tick interval in minutes */
  intervalMinutes: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(60),
  ]),
  timezone: z.string().default("Europe/London"),

  /** IG Markets authentication */
  apiKey: z.string(),
  username: z.string(),
  password: z.string(),
  isDemo: z.boolean().default(true),

  /** Instruments to watch */
  watchlist: z.array(WatchlistItemSchema).min(1),

  /** Strategy selection */
  strategy: StrategyNameSchema,
  strategyParams: z.optional(StrategyParamsSchema),

  /** Risk management */
  risk: z.optional(RiskConfigSchema),

  /** Circuit breaker */
  circuitBreaker: z.optional(CircuitBreakerConfigSchema),

  /** Path to SQLite database file */
  dbPath: z.string().default("bot.db"),

  /** Optional account ID (for multi-account mode) */
  accountId: z.optional(z.number()),
});
export type BotConfig = z.infer<typeof BotConfigSchema>;

/** Default strategy parameters */
export const DEFAULT_STRATEGY_PARAMS: StrategyParams = {
  smaPeriodFast: 10,
  smaPeriodSlow: 20,
  atrPeriod: 14,
  atrStopMultiplier: 1.5,
  atrTargetMultiplier: 3.0,
};

/** Default risk configuration */
export const DEFAULT_RISK_CONFIG: RiskConfig = {
  maxRiskPerTradePct: 0.01,
  maxOpenPositions: 5,
  maxDailyLossPct: 0.03,
  maxMarginUtilPct: 0.5,
  useGuaranteedStops: false,
};

/** Default circuit breaker configuration */
export const DEFAULT_CIRCUIT_BREAKER_CONFIG: CircuitBreakerConfig = {
  maxConsecutiveLosses: 3,
  maxConsecutiveErrors: 5,
  cooldownMinutes: 60,
  maxDailyLossPct: 0.05,
};

/**
 * Parse and apply defaults to a raw bot config object.
 * Fills in missing optional fields with sensible defaults.
 */
export function parseBotConfig(
  raw: unknown,
): BotConfig &
  Required<Pick<BotConfig, "strategyParams" | "risk" | "circuitBreaker">> {
  const parsed = BotConfigSchema.parse(raw);
  return {
    ...parsed,
    strategyParams: parsed.strategyParams ?? DEFAULT_STRATEGY_PARAMS,
    risk: parsed.risk ?? DEFAULT_RISK_CONFIG,
    circuitBreaker: parsed.circuitBreaker ?? DEFAULT_CIRCUIT_BREAKER_CONFIG,
  };
}
