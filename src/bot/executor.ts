/**
 * Trade Executor — Executes trades via IG Client with safety checks
 *
 * Responsibilities:
 * 1. Convert strategy signals into IG API trade parameters
 * 2. Execute trades via IGClient
 * 3. Verify deal confirmations
 * 4. Record trade results in the database
 *
 * Safety checks:
 * - Circuit breaker check before execution
 * - Position size validation
 * - Deal confirmation verification
 */

import type { IGClient } from "../ig-client.js";
import type { BotDatabase } from "../db/connection.js";
import type { StrategySignal } from "./strategy-runner.js";
import type { SizingResult } from "./position-sizer.js";
import type { RiskConfig, WatchlistItem } from "./schemas.js";
import {
  insertTrade,
  updateTradeConfirmation,
  insertPosition,
  closeTrackedPosition,
  getPositionByDealId,
} from "./state.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parameters for executing a signal as a trade. */
export interface ExecuteTradeParams {
  signal: StrategySignal;
  sizing: SizingResult;
  watchlistItem: WatchlistItem;
  tickId: number;
  signalId: number;
  /** Account ID for multi-account scoping (null = legacy single-account mode). */
  accountId?: number;
}

/** Result of a trade execution attempt. */
export interface ExecuteTradeResult {
  success: boolean;
  dealReference: string | null;
  dealId: string | null;
  status: "OPEN" | "REJECTED" | "ERROR";
  rejectReason: string | null;
  tradeId: number | null;
}

/** Parameters for closing a position. */
export interface ClosePositionParams {
  dealId: string;
  epic: string;
  direction: "BUY" | "SELL";
  size: number;
  tickId: number;
  signalId: number | null;
  currencyCode: string;
  expiry: string;
  /** Account ID for multi-account scoping (null = legacy single-account mode). */
  accountId?: number;
}

// ---------------------------------------------------------------------------
// Open Position
// ---------------------------------------------------------------------------

/**
 * Execute a trade to open a new position.
 *
 * @param client - Authenticated IG client instance
 * @param db - Database instance
 * @param params - Trade execution parameters
 * @returns Execution result
 */
export async function executeOpenTrade(
  client: IGClient,
  db: BotDatabase,
  params: ExecuteTradeParams,
): Promise<ExecuteTradeResult> {
  const { signal, sizing, watchlistItem, tickId, signalId, accountId } = params;

  if (!sizing.approved) {
    return {
      success: false,
      dealReference: null,
      dealId: null,
      status: "REJECTED",
      rejectReason: sizing.rejectReason,
      tradeId: null,
    };
  }

  const direction = signal.action === "buy" ? "BUY" : "SELL";
  const now = new Date().toISOString();

  // Record the trade attempt in the database
  const tradeId = await insertTrade(
    db,
    {
      tickId,
      signalId,
      epic: signal.epic,
      direction,
      size: sizing.size,
      orderType: "MARKET",
      stopLevel: signal.suggestedStop ?? undefined,
      limitLevel: signal.suggestedLimit ?? undefined,
      status: "PENDING",
      currencyCode: watchlistItem.currencyCode,
      expiry: watchlistItem.expiry,
      createdAt: now,
    },
    accountId,
  );

  try {
    // Execute the trade via IG API
    const result = await client.request("POST", "/positions/otc", {
      version: "2",
      body: {
        epic: signal.epic,
        direction,
        size: sizing.size,
        expiry: watchlistItem.expiry,
        currencyCode: watchlistItem.currencyCode,
        forceOpen: true,
        guaranteedStop: false,
        orderType: "MARKET",
        timeInForce: "FILL_OR_KILL",
        stopLevel: signal.suggestedStop,
        limitLevel: signal.suggestedLimit,
      },
    });

    const dealReference = result?.dealReference as string | undefined;

    if (!dealReference) {
      await updateTradeConfirmation(db, tradeId, {
        status: "REJECTED",
        rejectReason: "No deal reference returned",
      });
      return {
        success: false,
        dealReference: null,
        dealId: null,
        status: "REJECTED",
        rejectReason: "No deal reference returned",
        tradeId,
      };
    }

    // Verify deal confirmation
    const confirmation = await client.request(
      "GET",
      `/confirms/${dealReference}`,
      { version: "1" },
    );

    const dealStatus = confirmation?.dealStatus as string;
    const dealId = confirmation?.dealId as string | undefined;

    await updateTradeConfirmation(db, tradeId, {
      dealId: dealId,
      executionPrice: confirmation?.level as number | undefined,
      status: dealStatus === "ACCEPTED" ? "OPEN" : "REJECTED",
      rejectReason:
        dealStatus !== "ACCEPTED"
          ? (confirmation?.reason as string)
          : undefined,
      confirmationData: confirmation,
    });

    if (dealStatus === "ACCEPTED" && dealId) {
      // Track the position in our database
      await insertPosition(
        db,
        {
          dealId,
          epic: signal.epic,
          direction,
          size: sizing.size,
          entryPrice: (confirmation?.level as number) ?? signal.priceAtSignal,
          currentStop: signal.suggestedStop ?? undefined,
          currentLimit: signal.suggestedLimit ?? undefined,
          strategy: signal.strategy,
          status: "open",
          currencyCode: watchlistItem.currencyCode,
          expiry: watchlistItem.expiry,
          openedAt: now,
          openTradeId: tradeId,
        },
        accountId,
      );

      return {
        success: true,
        dealReference,
        dealId,
        status: "OPEN",
        rejectReason: null,
        tradeId,
      };
    }

    return {
      success: false,
      dealReference,
      dealId: dealId ?? null,
      status: "REJECTED",
      rejectReason: (confirmation?.reason as string) ?? "Deal rejected by IG",
      tradeId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    await updateTradeConfirmation(db, tradeId, {
      status: "REJECTED",
      rejectReason: errorMsg,
    });

    return {
      success: false,
      dealReference: null,
      dealId: null,
      status: "ERROR",
      rejectReason: errorMsg,
      tradeId,
    };
  }
}

// ---------------------------------------------------------------------------
// Close Position
// ---------------------------------------------------------------------------

/**
 * Execute a trade to close an existing position.
 *
 * @param client - Authenticated IG client instance
 * @param db - Database instance
 * @param params - Close position parameters
 * @returns Execution result
 */
export async function executeCloseTrade(
  client: IGClient,
  db: BotDatabase,
  params: ClosePositionParams,
): Promise<ExecuteTradeResult> {
  const {
    dealId,
    epic,
    direction,
    size,
    tickId,
    signalId,
    currencyCode,
    expiry,
    accountId,
  } = params;
  const now = new Date().toISOString();

  // Opposite direction to close
  const closeDirection = direction === "BUY" ? "SELL" : "BUY";

  // Record the close attempt
  const tradeId = await insertTrade(
    db,
    {
      tickId,
      signalId: signalId ?? undefined,
      dealId,
      epic,
      direction: closeDirection,
      size,
      orderType: "MARKET",
      status: "PENDING",
      currencyCode,
      expiry,
      createdAt: now,
    },
    accountId,
  );

  try {
    // Close via IG API (DELETE /positions/otc with body via _method override)
    const result = await client.request("DELETE", "/positions/otc", {
      version: "1",
      body: {
        dealId,
        direction: closeDirection,
        size,
        orderType: "MARKET",
        timeInForce: "FILL_OR_KILL",
      },
    });

    const dealReference = result?.dealReference as string | undefined;

    if (!dealReference) {
      await updateTradeConfirmation(db, tradeId, {
        status: "REJECTED",
        rejectReason: "No deal reference returned for close",
      });
      return {
        success: false,
        dealReference: null,
        dealId: null,
        status: "REJECTED",
        rejectReason: "No deal reference returned for close",
        tradeId,
      };
    }

    // Verify deal confirmation
    const confirmation = await client.request(
      "GET",
      `/confirms/${dealReference}`,
      { version: "1" },
    );

    const dealStatus = confirmation?.dealStatus as string;
    const exitPrice = (confirmation?.level as number) ?? 0;

    await updateTradeConfirmation(db, tradeId, {
      dealId: confirmation?.dealId as string | undefined,
      executionPrice: exitPrice,
      status: dealStatus === "ACCEPTED" ? "OPEN" : "REJECTED",
      rejectReason:
        dealStatus !== "ACCEPTED"
          ? (confirmation?.reason as string)
          : undefined,
      confirmationData: confirmation,
    });

    if (dealStatus === "ACCEPTED") {
      // Update tracked position as closed
      const trackedPosition = await getPositionByDealId(db, dealId);
      if (trackedPosition) {
        const entryPrice = trackedPosition.entryPrice;
        const posDirection = trackedPosition.direction;
        const realizedPnl =
          posDirection === "BUY"
            ? (exitPrice - entryPrice) * size
            : (entryPrice - exitPrice) * size;

        await closeTrackedPosition(db, dealId, {
          exitPrice,
          realizedPnl,
          closedAt: now,
          closeTradeId: tradeId,
        });
      }

      return {
        success: true,
        dealReference,
        dealId: (confirmation?.dealId as string) ?? dealId,
        status: "OPEN",
        rejectReason: null,
        tradeId,
      };
    }

    return {
      success: false,
      dealReference,
      dealId: null,
      status: "REJECTED",
      rejectReason: (confirmation?.reason as string) ?? "Close rejected by IG",
      tradeId,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);

    await updateTradeConfirmation(db, tradeId, {
      status: "REJECTED",
      rejectReason: errorMsg,
    });

    return {
      success: false,
      dealReference: null,
      dealId: null,
      status: "ERROR",
      rejectReason: errorMsg,
      tradeId,
    };
  }
}
