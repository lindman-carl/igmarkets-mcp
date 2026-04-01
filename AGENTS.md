# IG Markets OpenClaw Plugin - Agent Guidelines

This is an OpenClaw plugin that wraps the IG Markets REST Trading API. It
exposes 53 tools for stock/CFD/spread-bet trading via IG Markets. All tool names
are prefixed with `ig_`.

## Installation

```bash
openclaw plugins install igmarkets
```

Or install from a local directory:

```bash
openclaw plugins install ./
```

## Configuration

Configure the plugin in your `openclaw.json`:

```json5
{
  plugins: {
    entries: {
      igmarkets: {
        enabled: true,
        config: {
          apiKey: "your-ig-api-key",
          username: "your-ig-username",
          password: "your-ig-password",
          isDemo: true, // default: true (safety)
          tradeApproval: true, // default: true (prompts before trades)
        },
      },
    },
  },
}
```

Credentials can also be provided at runtime via the `ig_login` tool.

## Critical Rules

1. **Default to demo mode.** Always use `isDemo: true` unless the user
   explicitly asks for live trading. Live trading uses real money.
2. **Confirm before trading.** Always confirm with the user before executing
   `ig_create_position`, `ig_close_position`, `ig_create_working_order`, or
   `ig_delete_working_order`. Summarize the trade parameters first.
3. **Check deal confirmations.** After any trade operation, call
   `ig_deal_confirmation` with the returned `dealReference` to verify the
   trade was accepted (status: OPEN) or rejected.
4. **Session must exist.** Most tools require an active session. If you get
   "IG client not initialized", use `ig_login` or check `ig_session_status`.
5. **Direction on close is inverted.** When closing a BUY position, direction
   must be SELL (and vice versa).

## Trade Safety Hook

The plugin includes a `before_tool_call` hook that requires user approval before
executing trade-mutating tools:

- `ig_create_position`
- `ig_close_position`
- `ig_create_working_order`
- `ig_delete_working_order`

This is enabled by default. To disable, set `tradeApproval: false` in the plugin
config.

## Authentication Flow

The plugin auto-logs in at startup if credentials are configured in the plugin
config (`apiKey`, `username`, `password`).

If not auto-logged in, use `ig_login` (OAuth v3) or `ig_login_v2` (CST tokens).
Use `ig_session_status` to check if a session is active without making an API call.
If the session expires, call `ig_refresh_token` (v3) or re-login.

## Common Workflows

### Look up a market

1. `ig_search_markets` with a search term (e.g. "AAPL", "FTSE", "Tesla")
2. Note the `epic` from results (e.g. "IX.D.FTSE.DAILY.IP")
3. `ig_market` with the epic for full instrument details (min deal size, margin, hours)

### Open a position

1. Search for the market and get the `epic`
2. `ig_market` to check instrument details (expiry, min size, currency)
3. Confirm trade details with the user
4. `ig_create_position` with required fields: epic, direction, size, expiry,
   currencyCode, forceOpen, guaranteedStop, orderType
5. `ig_deal_confirmation` with the returned dealReference
6. Report whether it was OPEN (accepted) or REJECTED

### Close a position

1. `ig_positions` to list open positions
2. Identify the position to close (note dealId, direction, size)
3. Confirm with user
4. `ig_close_position` with dealId, opposite direction, size, orderType: "MARKET"
5. `ig_deal_confirmation` to verify

### Monitor positions

1. `ig_positions` - all open positions with P&L
2. `ig_position` - single position by dealId
3. `ig_update_position` - adjust stops/limits on an existing position

### Working orders (limit/stop orders)

1. `ig_working_orders` - list pending orders
2. `ig_create_working_order` - place a limit or stop order
3. `ig_update_working_order` - modify level, stops, limits
4. `ig_delete_working_order` - cancel an order

### Account & history

1. `ig_accounts` - list all accounts (demo, live, sub-accounts)
2. `ig_activity_history` - recent trading activity (v3 paged)
3. `ig_transaction_history` - transaction records (v2 paged)
4. `ig_preferences` / `ig_update_preferences` - trailing stops default etc.

### Price data

1. `ig_prices` - default price snapshot for an epic + resolution
2. `ig_prices_points` - last N data points
3. `ig_prices_range` - prices between two dates
4. Resolutions: SECOND, MINUTE, MINUTE_2, MINUTE_3, MINUTE_5, MINUTE_10,
   MINUTE_15, MINUTE_30, HOUR, HOUR_2, HOUR_3, HOUR_4, DAY, WEEK, MONTH

### Market sentiment

1. `ig_client_sentiment` - bull/bear % for a single market
2. `ig_client_sentiment_bulk` - sentiment for multiple markets at once
3. `ig_related_sentiment` - sentiment for related markets

## All 53 Tools

### Session (8)

| Tool                 | Description                                  |
| -------------------- | -------------------------------------------- |
| `ig_login`           | Login with OAuth v3 (recommended)            |
| `ig_login_v2`        | Login with CST/security tokens (v2)          |
| `ig_logout`          | End current session                          |
| `ig_session_details` | Get session info (account, client, timezone) |
| `ig_switch_account`  | Switch active account                        |
| `ig_refresh_token`   | Refresh OAuth access token                   |
| `ig_encryption_key`  | Get password encryption key                  |
| `ig_session_status`  | Check auth status (local, no API call)       |

### Accounts (9)

| Tool                            | Description                     |
| ------------------------------- | ------------------------------- |
| `ig_accounts`                   | List all accounts               |
| `ig_preferences`                | Get account preferences         |
| `ig_update_preferences`         | Update account preferences      |
| `ig_activity_history`           | Activity history (v3, paged)    |
| `ig_activity_history_range`     | Activity by date range (v1)     |
| `ig_activity_history_period`    | Activity by period (v1)         |
| `ig_transaction_history`        | Transactions (v2, paged)        |
| `ig_transaction_history_range`  | Transactions by date range (v1) |
| `ig_transaction_history_period` | Transactions by period (v1)     |

### Dealing (10)

| Tool                      | Description                        |
| ------------------------- | ---------------------------------- |
| `ig_deal_confirmation`    | Check outcome of a trade operation |
| `ig_positions`            | List all open positions            |
| `ig_position`             | Get single position by dealId      |
| `ig_create_position`      | Open a new position                |
| `ig_close_position`       | Close a position                   |
| `ig_update_position`      | Update stops/limits on a position  |
| `ig_working_orders`       | List all working orders            |
| `ig_create_working_order` | Create a limit/stop order          |
| `ig_delete_working_order` | Cancel a working order             |
| `ig_update_working_order` | Modify a working order             |

### Markets (8)

| Tool                      | Description                                     |
| ------------------------- | ----------------------------------------------- |
| `ig_categories`           | List market categories (top-level navigation)   |
| `ig_category_instruments` | List instruments in a category                  |
| `ig_markets`              | Get details for multiple markets (by epic list) |
| `ig_market`               | Get full details for a single market            |
| `ig_search_markets`       | Search markets by keyword                       |
| `ig_prices`               | Price snapshot (default range)                  |
| `ig_prices_points`        | Last N price data points                        |
| `ig_prices_range`         | Prices between two dates                        |

### Watchlists (6)

| Tool                         | Description                      |
| ---------------------------- | -------------------------------- |
| `ig_watchlists`              | List all watchlists              |
| `ig_create_watchlist`        | Create a new watchlist           |
| `ig_watchlist`               | Get instruments in a watchlist   |
| `ig_delete_watchlist`        | Delete a watchlist               |
| `ig_watchlist_add_market`    | Add a market to a watchlist      |
| `ig_watchlist_remove_market` | Remove a market from a watchlist |

### Sentiment (3)

| Tool                       | Description                    |
| -------------------------- | ------------------------------ |
| `ig_client_sentiment_bulk` | Sentiment for multiple markets |
| `ig_client_sentiment`      | Sentiment for a single market  |
| `ig_related_sentiment`     | Sentiment for related markets  |

### General (9)

| Tool                     | Description                              |
| ------------------------ | ---------------------------------------- |
| `ig_costs_open`          | Get costs/charges for opening a position |
| `ig_costs_close`         | Get costs/charges for closing a position |
| `ig_costs_edit`          | Get costs/charges for editing a position |
| `ig_costs_pdf`           | Download costs PDF document              |
| `ig_costs_history`       | Historical costs and charges             |
| `ig_applications`        | List API applications                    |
| `ig_update_application`  | Update an API application                |
| `ig_disable_application` | Disable an API application               |
| `ig_repeat_deal_window`  | Get repeat deal window info              |

## Trading Skills

The plugin includes specialized skills for higher-level trading workflows. These
provide opinionated, step-by-step guidance beyond the basic tool reference.

| Skill                  | Directory                      | Use When                                                             |
| ---------------------- | ------------------------------ | -------------------------------------------------------------------- |
| `igmarkets`            | `skills/igmarkets/`            | General tool reference and basic workflows                           |
| `portfolio-management` | `skills/portfolio-management/` | Portfolio review, P&L analysis, exposure, rebalancing                |
| `cfd-trading`          | `skills/cfd-trading/`          | Opening/closing CFDs, margin, leverage, DFB, spread bets             |
| `market-analysis`      | `skills/market-analysis/`      | Price analysis, sentiment, multi-timeframe review, screening         |
| `risk-management`      | `skills/risk-management/`      | Position sizing, stop strategies, risk/reward, portfolio risk        |
| `trading-strategies`   | `skills/trading-strategies/`   | Systematic strategies: trend, breakout, mean-reversion, contrarian   |
| `trading-bot`          | `skills/trading-bot/`          | Automated bot setup, config, deployment, monitoring, troubleshooting |

Skills are composable. For example, a typical trade flow uses:

1. **market-analysis** to research the instrument
2. **trading-strategies** to identify an entry signal
3. **risk-management** to size the position and set stops
4. **cfd-trading** to execute the trade
5. **portfolio-management** to monitor the overall portfolio

For automated trading, use the **trading-bot** skill which combines strategies,
risk management, and execution into a scheduled pipeline.

## Key IG Concepts

- **Epic**: Unique market identifier (e.g. "IX.D.FTSE.DAILY.IP", "CS.D.AAPL.CFD.IP")
- **DFB**: "Daily Funded Bet" - the most common expiry for CFDs/spread bets
- **Deal Reference**: Returned from trade operations; use with `ig_deal_confirmation`
- **Deal ID**: Unique identifier for an open position or working order
- **OTC**: Over-the-counter - the market type for CFDs and spread bets
- **Spread**: Difference between bid and offer price (this is IG's commission)
- **Guaranteed Stop**: A stop that is guaranteed to execute at the set level (extra charge)

## Automated Trading Bot

The plugin includes an automated trading bot that runs on a cron schedule via
Trigger.dev. See the `trading-bot` skill (`skills/trading-bot/SKILL.md`) for
full documentation.

### Quick Reference

- **Config file**: `bot-config.json` in project root
- **Trigger.dev config**: `trigger.config.ts`
- **Scheduled task**: `trading-bot` (cron, every 15min during market hours)
- **Manual task**: `trading-bot-manual` (on-demand testing)
- **Database**: SQLite via Drizzle ORM (`bot.db`)
- **Strategies**: `trend-following`, `breakout`, `mean-reversion`, `sentiment-contrarian`

### Bot Source Files

| File                         | Purpose                             |
| ---------------------------- | ----------------------------------- |
| `src/trigger/trading-bot.ts` | Trigger.dev task definitions        |
| `src/bot/tick.ts`            | Main tick orchestrator              |
| `src/bot/config.ts`          | Config loader (file + env)          |
| `src/bot/schemas.ts`         | Zod v4 schemas and types            |
| `src/bot/strategy-runner.ts` | 4 strategy implementations          |
| `src/bot/position-sizer.ts`  | Risk-based position sizing          |
| `src/bot/executor.ts`        | Trade execution + confirmation      |
| `src/bot/circuit-breaker.ts` | Safety circuit breaker              |
| `src/bot/state.ts`           | SQLite persistence CRUD             |
| `src/bot/prompt-parser.ts`   | Strategy prompt parser (YAML + MD)  |
| `src/bot/logger.ts`          | Structured trade journal            |
| `src/lib/indicators.ts`      | Technical indicators (SMA, ATR, BB) |
| `src/db/schema.ts`           | Drizzle ORM table definitions       |

### Database Schema (7 tables)

| Table        | Purpose                                              |
| ------------ | ---------------------------------------------------- |
| `strategies` | Named strategy configs with markdown prompt + params |
| `accounts`   | IG trading accounts, each linked to a strategy       |
| `ticks`      | One row per bot execution cycle                      |
| `signals`    | Strategy signals generated during ticks              |
| `trades`     | Executed trade operations and outcomes               |
| `positions`  | Tracked open positions and their lifecycle           |
| `bot_state`  | Key-value store for misc state (circuit breaker)     |

The `ticks`, `signals`, `trades`, and `positions` tables have a nullable
`account_id` column for multi-account scoping. `NULL` means legacy
single-account mode.

### Multi-Account / Strategy Layer

Each **strategy** has:
- A unique `name`
- A markdown `prompt` with YAML frontmatter (tickers, risk params, strategy type)
- A `strategyType` (e.g. "trend-following", "breakout", or custom)
- Optional JSON `strategyParams` and `riskConfig` overrides
- An `isActive` flag

Each **account** has:
- A unique `name` (e.g. "UK Indices Demo")
- IG credentials (`igApiKey`, `igUsername`, `igPassword`, `isDemo`)
- A `strategyId` FK linking to a strategy
- Tick interval and timezone config
- An `isActive` flag

Strategy prompts use **YAML frontmatter + markdown body** format:

```markdown
---
name: "FTSE Trend Follower"
tickers:
  - epic: "IX.D.FTSE.DAILY.IP"
    expiry: "DFB"
    currencyCode: "GBP"
strategyType: "trend-following"
riskPerTrade: 0.01
maxOpenPositions: 3
---

## Trading Rules

Buy when SMA10 crosses above SMA20.
```

Parse with `parseStrategyPrompt(prompt)` from `src/bot/prompt-parser.ts`.

### State Layer Functions (state.ts)

Strategy CRUD: `insertStrategy`, `getStrategy`, `getStrategyByName`,
`getActiveStrategies`, `updateStrategy`, `deleteStrategy`

Account CRUD: `insertAccount`, `getAccount`, `getAccountByName`,
`getActiveAccounts`, `updateAccount`, `deleteAccount`

Circuit breaker and position queries accept optional `accountId` for
per-account scoping.

### Key Conventions for Bot Code

- The bot uses **its own `IGClient` instance** — not the plugin's `getClient()` singleton
- **Zod v4** schemas — import from `"zod/v4"`
- **Drizzle ORM** with `better-sqlite3` for state persistence
- **No retries** on Trigger.dev tasks (`maxAttempts: 1`) to prevent duplicate trades
- **Demo mode by default** (`isDemo: true`)
- All `.ts` files use **`.js` extension imports** (Node16 module resolution)
