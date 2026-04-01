/**
 * Bot Module - Barrel Export
 *
 * Re-exports all bot schemas, types, state persistence operations,
 * strategy runner, position sizer, circuit breaker, executor, and logger.
 */

// ---------------------------------------------------------------------------
// Schemas and types
// ---------------------------------------------------------------------------

export {
  // Enums
  TickStatusSchema,
  SignalActionSchema,
  SignalTypeSchema,
  StrategyNameSchema,
  DirectionSchema,
  OrderTypeSchema,
  TradeStatusSchema,
  PositionStatusSchema,
  // Domain schemas
  IndicatorDataSchema,
  TickSchema,
  InsertTickSchema,
  SignalSchema,
  InsertSignalSchema,
  TradeSchema,
  InsertTradeSchema,
  PositionSchema,
  InsertPositionSchema,
  BotStateEntrySchema,
  CircuitBreakerStateSchema,
  // Compound schemas
  WatchlistItemSchema,
  StrategyParamsSchema,
  RiskConfigSchema,
  CircuitBreakerConfigSchema,
  BotConfigSchema,
  // Strategy / Account schemas
  StrategySchema,
  InsertStrategySchema,
  AccountSchema,
  InsertAccountSchema,
  StrategyPromptFrontmatterSchema,
  // Defaults
  DEFAULT_STRATEGY_PARAMS,
  DEFAULT_RISK_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_STATE,
  // Helpers
  parseBotConfig,
} from "./schemas.js";

export type {
  TickStatus,
  SignalAction,
  SignalType,
  StrategyName,
  Direction,
  OrderType,
  TradeStatus,
  PositionStatus,
  IndicatorData,
  Tick,
  InsertTick,
  Signal,
  InsertSignal,
  Trade,
  InsertTrade,
  Position,
  InsertPosition,
  BotStateEntry,
  CircuitBreakerState,
  WatchlistItem,
  StrategyParams,
  RiskConfig,
  CircuitBreakerConfig,
  BotConfig,
  Strategy,
  InsertStrategy,
  Account,
  InsertAccount,
  StrategyPromptFrontmatter,
  ParsedStrategyPrompt,
} from "./schemas.js";

// ---------------------------------------------------------------------------
// State persistence
// ---------------------------------------------------------------------------

export {
  // Tick operations
  startTick,
  completeTick,
  getLastTick,
  getRecentTicks,
  // Signal operations
  insertSignal,
  markSignalActed,
  markSignalSkipped,
  getSignalsByTick,
  getRecentSignals,
  // Trade operations
  insertTrade,
  updateTradeConfirmation,
  getTradesByTick,
  getRecentTrades,
  getTradesToday,
  // Position operations
  insertPosition,
  getOpenPositions,
  getPositionByDealId,
  updatePositionLevels,
  closeTrackedPosition,
  getClosedPositions,
  // Bot state (key-value)
  getState,
  setState,
  deleteState,
  // Circuit breaker state
  getCircuitBreakerState,
  setCircuitBreakerState,
  // Strategy operations
  insertStrategy,
  getStrategy,
  getStrategyByName,
  getActiveStrategies,
  updateStrategy,
  deleteStrategy,
  // Account operations
  insertAccount,
  getAccount,
  getAccountByName,
  getActiveAccounts,
  updateAccount,
  deleteAccount,
  // Summary
  getTickSummary,
} from "./state.js";

export type {
  TickRow,
  SignalRow,
  TradeRow,
  PositionRow,
  StrategyRow,
  AccountRow,
} from "./state.js";

// ---------------------------------------------------------------------------
// Strategy runner
// ---------------------------------------------------------------------------

export { runStrategy } from "./strategy-runner.js";

export type {
  SentimentData,
  StrategySignal,
  StrategyContext,
} from "./strategy-runner.js";

// ---------------------------------------------------------------------------
// Position sizer
// ---------------------------------------------------------------------------

export {
  calculatePositionSize,
  calculateTrailingStop,
} from "./position-sizer.js";

export type { SizingInput, SizingResult } from "./position-sizer.js";

// ---------------------------------------------------------------------------
// Circuit breaker
// ---------------------------------------------------------------------------

export {
  checkCircuitBreaker,
  recordWin,
  recordLoss,
  recordError,
  recordSuccess,
  resetDaily,
  resetCircuitBreaker,
} from "./circuit-breaker.js";

export type { CircuitBreakerCheck } from "./circuit-breaker.js";

// ---------------------------------------------------------------------------
// Executor
// ---------------------------------------------------------------------------

export { executeOpenTrade, executeCloseTrade } from "./executor.js";

export type {
  ExecuteTradeParams,
  ExecuteTradeResult,
  ClosePositionParams,
} from "./executor.js";

// ---------------------------------------------------------------------------
// Logger
// ---------------------------------------------------------------------------

export { createLogger, LOG_CATEGORIES } from "./logger.js";

export type { LogLevel, LogEntry, Logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Tick Orchestrator
// ---------------------------------------------------------------------------

export {
  executeTick,
  executeAccountTick,
  executeAllAccountTicks,
} from "./tick.js";

export type {
  ResolvedBotConfig,
  TickResult,
  TickOptions,
  AccountTickResult,
  MultiAccountTickResult,
  AccountTickOptions,
  MultiAccountTickOptions,
} from "./tick.js";

// ---------------------------------------------------------------------------
// Strategy Prompt Parser
// ---------------------------------------------------------------------------

export { parseStrategyPrompt, parseSimpleYaml } from "./prompt-parser.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export { loadBotConfig, buildCronExpression } from "./config.js";
