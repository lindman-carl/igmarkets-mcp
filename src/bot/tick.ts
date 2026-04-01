/**
 * Tick Orchestrator — Main Bot Loop
 *
 * This is the core function called every tick (e.g. every 15 minutes).
 * It orchestrates the full lifecycle:
 *
 *   1. Load state from last tick
 *   2. Check circuit breaker (stop if tripped)
 *   3. Authenticate / refresh session
 *   4. FOR EACH watched instrument:
 *      a. Fetch current price + recent history
 *      b. Fetch client sentiment (optional)
 *      c. Calculate indicators
 *      d. Run strategy → generate signals
 *   5. Check existing positions (trailing stops, exit signals)
 *   6. FOR EACH new entry signal:
 *      a. Calculate position size
 *      b. Execute trade if all checks pass
 *   7. Log tick results
 *   8. Save state for next tick
 *
 * The tick function is pure orchestration — all domain logic lives in the
 * dedicated modules (strategy-runner, position-sizer, executor, etc.).
 */

import { IGClient } from "../ig-client.js";
import type { BotDatabase } from "../db/connection.js";
import { createDatabase } from "../db/connection.js";
import { runMigrations } from "../db/migrate.js";
import type { Candle } from "../lib/indicators.js";
import { runStrategy } from "./strategy-runner.js";
import type { SentimentData, StrategySignal } from "./strategy-runner.js";
import {
  calculatePositionSize,
  calculateTrailingStop,
} from "./position-sizer.js";
import { executeOpenTrade, executeCloseTrade } from "./executor.js";
import {
  checkCircuitBreaker,
  recordWin,
  recordLoss,
  recordError,
  recordSuccess,
  resetDaily,
} from "./circuit-breaker.js";
import { createLogger, LOG_CATEGORIES } from "./logger.js";
import type { Logger } from "./logger.js";
import {
  startTick,
  completeTick,
  insertSignal,
  markSignalActed,
  markSignalSkipped,
  getOpenPositions,
  getCircuitBreakerState,
  setCircuitBreakerState,
  getState,
  setState,
  updatePositionLevels,
} from "./state.js";
import type { PositionRow } from "./state.js";
import type {
  BotConfig,
  WatchlistItem,
  CircuitBreakerState,
} from "./schemas.js";
import { parseBotConfig } from "./schemas.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Full resolved config with defaults applied. */
export type ResolvedBotConfig = ReturnType<typeof parseBotConfig>;

/** Summary returned after each tick completes. */
export interface TickResult {
  tickId: number;
  status: "completed" | "skipped" | "error";
  instrumentsScanned: number;
  signalsGenerated: number;
  tradesExecuted: number;
  error: string | null;
  durationMs: number;
}

/** Options for the tick function. */
export interface TickOptions {
  /** Raw bot config (will be parsed and defaults applied). */
  config: unknown;
  /** Pre-created database instance (if not provided, one is created from config). */
  db?: BotDatabase;
  /** Pre-authenticated IG client instance (if not provided, one is created and logged in). */
  client?: IGClient;
  /** Logger instance (if not provided, one is created). */
  logger?: Logger;
  /** If true, skip authentication (e.g. for testing with a mock client). */
  skipAuth?: boolean;
}

// ---------------------------------------------------------------------------
// Main Tick Function
// ---------------------------------------------------------------------------

/**
 * Execute a single tick of the trading bot.
 *
 * This is the main entry point. Call this on every scheduled interval.
 *
 * @param options - Tick options (config is required; rest are optional overrides)
 * @returns TickResult summarizing what happened
 */
export async function executeTick(options: TickOptions): Promise<TickResult> {
  const startTime = Date.now();
  const config = parseBotConfig(options.config);
  const logger = options.logger ?? createLogger("info");
  const db = options.db ?? createDatabaseWithMigrations(config.dbPath);
  let client = options.client ?? null;

  let tickId = 0;
  let instrumentsScanned = 0;
  let signalsGenerated = 0;
  let tradesExecuted = 0;

  try {
    // ------------------------------------------------------------------
    // Step 1: Start tick record
    // ------------------------------------------------------------------
    const now = new Date().toISOString();
    tickId = await startTick(db, { startedAt: now, status: "running" });
    logger.info(LOG_CATEGORIES.TICK, `Tick #${tickId} started`, {
      intervalMinutes: config.intervalMinutes,
      strategy: config.strategy,
      watchlistSize: config.watchlist.length,
    });

    // ------------------------------------------------------------------
    // Step 2: Check circuit breaker
    // ------------------------------------------------------------------
    let cbState = await getCircuitBreakerState(db);

    // Reset daily counters if it's a new trading day
    cbState = await maybeResetDaily(db, cbState, logger);

    const cbCheck = checkCircuitBreaker(
      cbState,
      config.circuitBreaker,
      0, // Account balance checked after auth
    );

    if (!cbCheck.canTrade) {
      logger.warn(
        LOG_CATEGORIES.CIRCUIT_BREAKER,
        `Circuit breaker blocked: ${cbCheck.reason}`,
      );
      await setCircuitBreakerState(db, cbCheck.state);
      await completeTick(db, tickId, {
        status: "skipped",
        completedAt: new Date().toISOString(),
        error: cbCheck.reason ?? undefined,
      });
      return {
        tickId,
        status: "skipped",
        instrumentsScanned: 0,
        signalsGenerated: 0,
        tradesExecuted: 0,
        error: cbCheck.reason,
        durationMs: Date.now() - startTime,
      };
    }

    // Update state from circuit breaker check (may have reset from cooldown)
    cbState = cbCheck.state;

    // ------------------------------------------------------------------
    // Step 3: Authenticate / refresh session
    // ------------------------------------------------------------------
    if (!client) {
      client = new IGClient({
        apiKey: config.apiKey,
        username: config.username,
        password: config.password,
        isDemo: config.isDemo,
      });
    }

    if (!options.skipAuth) {
      await ensureAuthenticated(client, logger);
    }

    // ------------------------------------------------------------------
    // Step 3b: Get account balance for risk calculations
    // ------------------------------------------------------------------
    const accountBalance = await getAccountBalance(client, logger);

    // Re-check circuit breaker with actual account balance
    const cbCheckWithBalance = checkCircuitBreaker(
      cbState,
      config.circuitBreaker,
      accountBalance,
    );
    if (!cbCheckWithBalance.canTrade) {
      logger.warn(
        LOG_CATEGORIES.CIRCUIT_BREAKER,
        `Circuit breaker blocked (balance check): ${cbCheckWithBalance.reason}`,
      );
      await setCircuitBreakerState(db, cbCheckWithBalance.state);
      await completeTick(db, tickId, {
        status: "skipped",
        completedAt: new Date().toISOString(),
        error: cbCheckWithBalance.reason ?? undefined,
      });
      return {
        tickId,
        status: "skipped",
        instrumentsScanned: 0,
        signalsGenerated: 0,
        tradesExecuted: 0,
        error: cbCheckWithBalance.reason,
        durationMs: Date.now() - startTime,
      };
    }
    cbState = cbCheckWithBalance.state;

    // ------------------------------------------------------------------
    // Step 4: Get existing tracked positions
    // ------------------------------------------------------------------
    const trackedPositions = await getOpenPositions(db);
    const positionsByEpic = new Map<string, PositionRow>();
    for (const pos of trackedPositions) {
      positionsByEpic.set(pos.epic, pos);
    }

    logger.info(
      LOG_CATEGORIES.POSITION,
      `Open positions: ${trackedPositions.length}`,
      {
        epics: trackedPositions.map((p) => p.epic),
      },
    );

    // ------------------------------------------------------------------
    // Step 5: Process each watched instrument
    // ------------------------------------------------------------------
    const allSignals: Array<{
      signal: StrategySignal;
      signalId: number;
      watchlistItem: WatchlistItem;
    }> = [];

    for (const item of config.watchlist) {
      try {
        instrumentsScanned++;
        logger.info(LOG_CATEGORIES.MARKET, `Scanning ${item.epic}`);

        // 5a. Fetch price history
        const candles = await fetchCandles(client, item.epic, logger);
        if (candles.length < 21) {
          logger.warn(
            LOG_CATEGORIES.MARKET,
            `Insufficient data for ${item.epic}: ${candles.length} candles`,
          );
          continue;
        }

        // 5b. Fetch sentiment (optional, non-fatal)
        const sentiment = await fetchSentiment(client, item.epic, logger);

        // 5c. Run strategy
        const existingPosition = positionsByEpic.get(item.epic);
        const hasOpenPosition = !!existingPosition;
        const openPositionDirection = existingPosition
          ? (existingPosition.direction as "BUY" | "SELL")
          : null;

        const signals = runStrategy(
          config.strategy,
          item.epic,
          candles,
          sentiment,
          config.strategyParams,
          hasOpenPosition,
          openPositionDirection,
        );

        // 5d. Record signals and handle exits/entries
        for (const signal of signals) {
          signalsGenerated++;

          const signalId = await insertSignal(db, {
            tickId,
            epic: signal.epic,
            strategy: signal.strategy,
            action: signal.action,
            signalType: signal.signalType,
            confidence: signal.confidence,
            priceAtSignal: signal.priceAtSignal,
            suggestedStop: signal.suggestedStop ?? undefined,
            suggestedLimit: signal.suggestedLimit ?? undefined,
            indicatorData: signal.indicatorData,
            createdAt: new Date().toISOString(),
          });

          logger.info(
            LOG_CATEGORIES.SIGNAL,
            `Signal: ${signal.action} ${signal.epic}`,
            {
              strategy: signal.strategy,
              type: signal.signalType,
              confidence: signal.confidence,
              price: signal.priceAtSignal,
            },
          );

          if (signal.signalType === "exit" && signal.action === "close") {
            // Handle exit signal immediately
            if (existingPosition) {
              await handleExitSignal(
                client,
                db,
                existingPosition,
                signal,
                signalId,
                tickId,
                cbState,
                logger,
              );
              tradesExecuted++;
              await markSignalActed(db, signalId);
            }
          } else if (signal.signalType === "entry") {
            allSignals.push({ signal, signalId, watchlistItem: item });
          }
        }

        // 5e. Check trailing stops on existing positions
        if (existingPosition && candles.length > 0) {
          await handleTrailingStops(
            client,
            db,
            existingPosition,
            candles,
            config.strategyParams.atrStopMultiplier,
            logger,
          );
        }

        // Record successful API interaction
        cbState = recordSuccess(cbState);
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        logger.error(
          LOG_CATEGORIES.ERROR,
          `Error processing ${item.epic}: ${errorMsg}`,
        );
        cbState = recordError(cbState);
      }
    }

    // ------------------------------------------------------------------
    // Step 6: Execute entry trades
    // ------------------------------------------------------------------
    for (const { signal, signalId, watchlistItem } of allSignals) {
      try {
        // Get instrument details for sizing
        const minDealSize = await getMinDealSize(client, signal.epic, logger);

        if (signal.suggestedStop === null) {
          await markSignalSkipped(db, signalId, "No stop level suggested");
          logger.warn(
            LOG_CATEGORIES.SIZING,
            `Skipping ${signal.epic}: no stop level`,
          );
          continue;
        }

        const sizing = calculatePositionSize(
          {
            accountBalance,
            entryPrice: signal.priceAtSignal,
            stopLevel: signal.suggestedStop,
            limitLevel: signal.suggestedLimit,
            direction: signal.action === "buy" ? "BUY" : "SELL",
            minDealSize,
          },
          config.risk,
          trackedPositions.length,
          cbState.dailyPnl,
        );

        if (!sizing.approved) {
          await markSignalSkipped(
            db,
            signalId,
            sizing.rejectReason ?? "Sizing rejected",
          );
          logger.warn(
            LOG_CATEGORIES.SIZING,
            `Sizing rejected for ${signal.epic}: ${sizing.rejectReason}`,
          );
          continue;
        }

        logger.info(
          LOG_CATEGORIES.SIZING,
          `Position size: ${sizing.size} for ${signal.epic}`,
          {
            riskAmount: sizing.riskAmount,
            riskRewardRatio: sizing.riskRewardRatio,
          },
        );

        // Execute the trade
        const result = await executeOpenTrade(client, db, {
          signal,
          sizing,
          watchlistItem,
          tickId,
          signalId,
        });

        if (result.success) {
          tradesExecuted++;
          await markSignalActed(db, signalId);
          cbState = recordSuccess(cbState);
          logger.info(
            LOG_CATEGORIES.EXECUTION,
            `Trade OPENED: ${signal.action} ${signal.epic}`,
            {
              dealId: result.dealId,
              size: sizing.size,
            },
          );
        } else {
          await markSignalSkipped(
            db,
            signalId,
            result.rejectReason ?? "Trade rejected",
          );
          cbState = recordError(cbState);
          logger.warn(
            LOG_CATEGORIES.EXECUTION,
            `Trade REJECTED: ${signal.epic}: ${result.rejectReason}`,
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        await markSignalSkipped(db, signalId, errorMsg);
        cbState = recordError(cbState);
        logger.error(
          LOG_CATEGORIES.ERROR,
          `Trade execution error for ${signal.epic}: ${errorMsg}`,
        );
      }
    }

    // ------------------------------------------------------------------
    // Step 7: Save circuit breaker state
    // ------------------------------------------------------------------
    await setCircuitBreakerState(db, cbState);

    // ------------------------------------------------------------------
    // Step 8: Complete tick
    // ------------------------------------------------------------------
    await completeTick(db, tickId, {
      status: "completed",
      completedAt: new Date().toISOString(),
      instrumentsScanned,
      signalsGenerated,
      tradesExecuted,
    });

    const durationMs = Date.now() - startTime;
    logger.info(
      LOG_CATEGORIES.TICK,
      `Tick #${tickId} completed in ${durationMs}ms`,
      {
        instrumentsScanned,
        signalsGenerated,
        tradesExecuted,
      },
    );

    return {
      tickId,
      status: "completed",
      instrumentsScanned,
      signalsGenerated,
      tradesExecuted,
      error: null,
      durationMs,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    logger.error(LOG_CATEGORIES.ERROR, `Tick failed: ${errorMsg}`);

    if (tickId > 0) {
      await completeTick(db, tickId, {
        status: "error",
        completedAt: new Date().toISOString(),
        error: errorMsg,
      }).catch(() => {}); // Don't throw on cleanup failure

      // Record the error in circuit breaker
      try {
        let cbState = await getCircuitBreakerState(db);
        cbState = recordError(cbState);
        await setCircuitBreakerState(db, cbState);
      } catch {
        // Ignore if DB is unavailable
      }
    }

    return {
      tickId,
      status: "error",
      instrumentsScanned,
      signalsGenerated,
      tradesExecuted,
      error: errorMsg,
      durationMs: Date.now() - startTime,
    };
  }
}

// ---------------------------------------------------------------------------
// Helper: Database with Migrations
// ---------------------------------------------------------------------------

function createDatabaseWithMigrations(dbPath: string): BotDatabase {
  runMigrations(dbPath);
  return createDatabase(dbPath);
}

// ---------------------------------------------------------------------------
// Helper: Authentication
// ---------------------------------------------------------------------------

async function ensureAuthenticated(
  client: IGClient,
  logger: Logger,
): Promise<void> {
  if (client.isAuthenticated()) {
    logger.debug(LOG_CATEGORIES.SESSION, "Session active, attempting refresh");
    try {
      await client.refreshSession();
      logger.info(LOG_CATEGORIES.SESSION, "Session refreshed successfully");
      return;
    } catch {
      logger.warn(LOG_CATEGORIES.SESSION, "Refresh failed, re-authenticating");
    }
  }

  logger.info(LOG_CATEGORIES.SESSION, "Logging in to IG Markets");
  await client.login();
  logger.info(LOG_CATEGORIES.SESSION, "Login successful", {
    accountId: client.getAccountId(),
  });
}

// ---------------------------------------------------------------------------
// Helper: Account Balance
// ---------------------------------------------------------------------------

async function getAccountBalance(
  client: IGClient,
  logger: Logger,
): Promise<number> {
  try {
    const accounts = await client.request("GET", "/accounts", { version: "1" });
    const accountList = accounts?.accounts as Array<{
      accountId: string;
      balance: {
        balance: number;
        deposit: number;
        profitLoss: number;
        available: number;
      };
    }>;

    const currentAccountId = client.getAccountId();
    const account = accountList?.find((a) => a.accountId === currentAccountId);
    const balance = account?.balance?.balance ?? 0;

    logger.info(LOG_CATEGORIES.SESSION, `Account balance: ${balance}`, {
      available: account?.balance?.available,
      profitLoss: account?.balance?.profitLoss,
    });

    return balance;
  } catch (error) {
    logger.warn(
      LOG_CATEGORIES.SESSION,
      "Could not fetch account balance, using 0",
    );
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Helper: Fetch Candles
// ---------------------------------------------------------------------------

/**
 * Fetch OHLC candles for an instrument using the DAY resolution.
 * Fetches the last 30 data points (days) for indicator calculation.
 */
async function fetchCandles(
  client: IGClient,
  epic: string,
  logger: Logger,
): Promise<Candle[]> {
  const data = await client.request("GET", `/prices/${epic}/DAY/30`, {
    version: "3",
  });

  const prices = data?.prices as Array<{
    openPrice: { bid: number; ask: number; lastTraded: number | null };
    highPrice: { bid: number; ask: number; lastTraded: number | null };
    lowPrice: { bid: number; ask: number; lastTraded: number | null };
    closePrice: { bid: number; ask: number; lastTraded: number | null };
  }>;

  if (!prices || !Array.isArray(prices)) {
    logger.warn(LOG_CATEGORIES.MARKET, `No price data returned for ${epic}`);
    return [];
  }

  // Use mid-price (average of bid and ask) for analysis
  const candles: Candle[] = prices.map((p) => ({
    open: (p.openPrice.bid + p.openPrice.ask) / 2,
    high: (p.highPrice.bid + p.highPrice.ask) / 2,
    low: (p.lowPrice.bid + p.lowPrice.ask) / 2,
    close: (p.closePrice.bid + p.closePrice.ask) / 2,
  }));

  logger.debug(
    LOG_CATEGORIES.MARKET,
    `Fetched ${candles.length} candles for ${epic}`,
  );
  return candles;
}

// ---------------------------------------------------------------------------
// Helper: Fetch Sentiment
// ---------------------------------------------------------------------------

async function fetchSentiment(
  client: IGClient,
  epic: string,
  logger: Logger,
): Promise<SentimentData | null> {
  try {
    // First get the marketId from market details
    const marketDetails = await client.request("GET", `/markets/${epic}`, {
      version: "3",
    });

    const marketId = marketDetails?.instrument?.marketId as string | undefined;
    if (!marketId) {
      logger.debug(LOG_CATEGORIES.MARKET, `No marketId found for ${epic}`);
      return null;
    }

    const sentiment = await client.request(
      "GET",
      `/clientsentiment/${marketId}`,
      { version: "1" },
    );

    if (
      sentiment &&
      typeof sentiment.longPositionPercentage === "number" &&
      typeof sentiment.shortPositionPercentage === "number"
    ) {
      return {
        longPositionPercentage: sentiment.longPositionPercentage,
        shortPositionPercentage: sentiment.shortPositionPercentage,
      };
    }

    return null;
  } catch (error) {
    logger.debug(
      LOG_CATEGORIES.MARKET,
      `Sentiment fetch failed for ${epic} (non-fatal)`,
    );
    return null;
  }
}

// ---------------------------------------------------------------------------
// Helper: Handle Exit Signals
// ---------------------------------------------------------------------------

async function handleExitSignal(
  client: IGClient,
  db: BotDatabase,
  position: PositionRow,
  signal: StrategySignal,
  signalId: number,
  tickId: number,
  cbState: CircuitBreakerState,
  logger: Logger,
): Promise<CircuitBreakerState> {
  logger.info(
    LOG_CATEGORIES.EXECUTION,
    `Closing position ${position.dealId} for ${position.epic}`,
  );

  const result = await executeCloseTrade(client, db, {
    dealId: position.dealId,
    epic: position.epic,
    direction: position.direction as "BUY" | "SELL",
    size: position.size,
    tickId,
    signalId,
    currencyCode: position.currencyCode,
    expiry: position.expiry,
  });

  if (result.success) {
    logger.info(LOG_CATEGORIES.EXECUTION, `Position closed: ${position.epic}`, {
      dealId: result.dealId,
    });

    // Update circuit breaker based on P&L
    // P&L is calculated in the executor and stored in the position
    // For now, we record it as a success; the actual P&L is tracked separately
    return recordSuccess(cbState);
  } else {
    logger.warn(
      LOG_CATEGORIES.EXECUTION,
      `Close failed for ${position.epic}: ${result.rejectReason}`,
    );
    return recordError(cbState);
  }
}

// ---------------------------------------------------------------------------
// Helper: Trailing Stops
// ---------------------------------------------------------------------------

async function handleTrailingStops(
  client: IGClient,
  db: BotDatabase,
  position: PositionRow,
  candles: Candle[],
  atrMultiplier: number,
  logger: Logger,
): Promise<void> {
  const currentPrice = candles[candles.length - 1].close;
  const currentStop = position.currentStop;

  if (currentStop === null || currentStop === undefined) return;

  // Calculate ATR for trailing stop
  const { atr } = await import("../lib/indicators.js");
  const atrVal = atr(candles);
  if (atrVal === null) return;

  const newStop = calculateTrailingStop(
    position.direction as "BUY" | "SELL",
    position.entryPrice,
    currentPrice,
    currentStop,
    atrVal,
  );

  if (newStop !== null) {
    logger.info(
      LOG_CATEGORIES.POSITION,
      `Trailing stop adjustment for ${position.epic}`,
      {
        oldStop: currentStop,
        newStop,
        currentPrice,
      },
    );

    // Update in our database
    await updatePositionLevels(db, position.dealId, { currentStop: newStop });

    // Update on IG
    try {
      await client.request("PUT", `/positions/otc/${position.dealId}`, {
        version: "2",
        body: {
          stopLevel: newStop,
          limitLevel: position.currentLimit,
          trailingStop: false,
        },
      });
      logger.info(
        LOG_CATEGORIES.POSITION,
        `Trailing stop updated on IG for ${position.epic}`,
      );
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.warn(
        LOG_CATEGORIES.POSITION,
        `Failed to update stop on IG: ${errorMsg}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Helper: Get Minimum Deal Size
// ---------------------------------------------------------------------------

async function getMinDealSize(
  client: IGClient,
  epic: string,
  logger: Logger,
): Promise<number> {
  try {
    const marketDetails = await client.request("GET", `/markets/${epic}`, {
      version: "3",
    });

    const minSize = marketDetails?.dealingRules?.minDealSize?.value as
      | number
      | undefined;
    return minSize ?? 0.5; // Conservative default
  } catch {
    logger.debug(
      LOG_CATEGORIES.MARKET,
      `Could not fetch min deal size for ${epic}, using 0.5`,
    );
    return 0.5;
  }
}

// ---------------------------------------------------------------------------
// Helper: Daily Reset
// ---------------------------------------------------------------------------

const LAST_RESET_DATE_KEY = "last_daily_reset";

async function maybeResetDaily(
  db: BotDatabase,
  cbState: CircuitBreakerState,
  logger: Logger,
): Promise<CircuitBreakerState> {
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const lastResetDate = await getState<string>(db, LAST_RESET_DATE_KEY);

  if (lastResetDate !== today) {
    logger.info(
      LOG_CATEGORIES.CIRCUIT_BREAKER,
      `New trading day: resetting daily counters`,
    );
    await setState(db, LAST_RESET_DATE_KEY, today);
    return resetDaily(cbState);
  }

  return cbState;
}
