/**
 * Bot Module - Barrel Export
 *
 * Re-exports all bot schemas, types, state persistence operations,
 * strategy runner, position sizer, circuit breaker, executor, and logger.
 */

export {
  TickStatusSchema,
  SignalActionSchema,
  SignalTypeSchema,
  StrategyNameSchema,
  DirectionSchema,
  OrderTypeSchema,
  TradeStatusSchema,
  PositionStatusSchema,
  IndicatorDataSchema,
  TickSchema,
  InsertTickSchema,
  SignalSchema,
  InsertSignalSchema,
  TradeSchema,
  InsertTradeSchema,
  PositionSchema,
  InsertPositionSchema,
  RiskStateSchema,
  CircuitBreakerStateSchema,
  WatchlistItemSchema,
  StrategyParamsSchema,
  RiskConfigSchema,
  CircuitBreakerConfigSchema,
  BotConfigSchema,
  StrategySchema,
  InsertStrategySchema,
  AccountSchema,
  InsertAccountSchema,
  InsertInstrumentSchema,
  InsertAccountSnapshotSchema,
  InsertCandleSchema,
  StrategyPromptFrontmatterSchema,
  DEFAULT_STRATEGY_PARAMS,
  DEFAULT_RISK_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_CONFIG,
  DEFAULT_CIRCUIT_BREAKER_STATE,
  DEFAULT_RISK_STATE,
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
  RiskState,
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
  InsertInstrument,
  InsertAccountSnapshot,
  InsertCandle,
  StrategyPromptFrontmatter,
  ParsedStrategyPrompt,
} from "./schemas.js";

export {
  startTick,
  completeTick,
  getLastTick,
  getRecentTicks,
  insertSignal,
  markSignalActed,
  markSignalSkipped,
  getSignalsByTick,
  getRecentSignals,
  insertTrade,
  updateTradeConfirmation,
  getTradesByTick,
  getRecentTrades,
  getTradesToday,
  insertPosition,
  getOpenPositions,
  getPositionByDealId,
  updatePositionLevels,
  closeTrackedPosition,
  getClosedPositions,
  getRiskState,
  upsertRiskState,
  resetRiskState,
  getCircuitBreakerState,
  setCircuitBreakerState,
  insertStrategy,
  getStrategy,
  getStrategyByName,
  getActiveStrategies,
  updateStrategy,
  deleteStrategy,
  insertAccount,
  getAccount,
  getAccountByName,
  getActiveAccounts,
  updateAccount,
  deleteAccount,
  insertInstrument,
  getInstrument,
  upsertInstrument,
  getStaleInstruments,
  insertAccountSnapshot,
  getRecentSnapshots,
  getSnapshotsInRange,
  upsertCandles,
  getCandles,
  getCandleRange,
  pruneOldCandles,
  getTickSummary,
} from "./state.js";

export type {
  TickRow,
  SignalRow,
  TradeRow,
  PositionRow,
  StrategyRow,
  AccountRow,
  InstrumentRow,
  AccountSnapshotRow,
  CandleRow,
  RiskStateRow,
} from "./state.js";

export { runStrategy } from "./strategy-runner.js";

export type {
  SentimentData,
  StrategySignal,
  StrategyContext,
} from "./strategy-runner.js";

export {
  calculatePositionSize,
  calculateTrailingStop,
} from "./position-sizer.js";

export type { SizingInput, SizingResult } from "./position-sizer.js";

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

export { executeOpenTrade, executeCloseTrade } from "./executor.js";

export type {
  ExecuteTradeParams,
  ExecuteTradeResult,
  ClosePositionParams,
} from "./executor.js";

export { createLogger, LOG_CATEGORIES } from "./logger.js";

export type { LogLevel, LogEntry, Logger } from "./logger.js";

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

export { parseStrategyPrompt, parseSimpleYaml } from "./prompt-parser.js";

export { loadBotConfig, buildCronExpression } from "./config.js";
