---
name: trading-bot
description: Automated trading bot that runs on a cron schedule via Trigger.dev. Covers bot configuration, tick lifecycle, strategy selection, risk parameters, circuit breaker, deployment, and monitoring. Use when the user asks about automated trading, scheduling trades, bot setup, or running strategies unattended.
---

# Automated Trading Bot

This skill covers the automated trading bot built into the IG Markets OpenClaw
plugin. The bot runs on a cron schedule via Trigger.dev, fetching market data,
running strategy logic, and executing trades without manual intervention.

## When to Use This Skill

- User asks about **automated trading**, **scheduling trades**, or **running a
  trading bot**
- User wants to **configure** the bot (instruments, strategy, risk, schedule)
- User needs to **deploy**, **monitor**, or **troubleshoot** the bot
- User asks about the **tick lifecycle**, **circuit breaker**, or **state
  persistence**
- User wants to **test** the bot with a manual tick run

## Critical Rules

1. **Always default to demo mode.** The bot sets `isDemo: true` by default.
   Never switch to live without explicit user confirmation and understanding
   that real money is at risk.
2. **Verify config before deploying.** Always review the full `bot-config.json`
   or environment variables with the user before deployment.
3. **Check circuit breaker status.** If the bot has stopped trading, check the
   `bot_state` table for circuit breaker state before assuming a bug.
4. **No retries on trades.** Trigger.dev tasks use `maxAttempts: 1` to prevent
   duplicate trade execution. This is by design — do not change it.
5. **The bot uses its own IGClient instance.** It does not share the plugin's
   singleton client. They are independent sessions.

## Architecture Overview

```
Trigger.dev Scheduler
  │
  ├── trading-bot (cron: */15 8-16 * * 1-5, Europe/London)
  │     └── executeTick(config, logger)
  │
  └── trading-bot-manual (on-demand, for testing)
        └── executeTick(config, logger)
```

### Tick Lifecycle

Each tick executes this sequence:

```
1.  Load state from SQLite (last tick, circuit breaker, positions)
2.  Check circuit breaker → skip tick if tripped and cooldown not elapsed
3.  Reset daily counters if new trading day
4.  Authenticate with IG Markets (new IGClient instance)
5.  Set account ID
6.  FOR EACH instrument in watchlist:
    a. Fetch 30 daily candles (OHLC data)
    b. Fetch client sentiment
    c. Fetch market details (bid/offer, instrument info)
    d. Fetch account balance
    e. Calculate technical indicators (SMA, ATR, Bollinger Bands)
    f. Check for EXIT signals on existing positions
    g. Check for ENTRY signals (new trades)
7.  FOR EACH exit signal:
    a. Close position via IG API
    b. Verify deal confirmation
    c. Update circuit breaker (win/loss)
8.  FOR EACH entry signal:
    a. Calculate position size (risk-based)
    b. Check position limits and daily loss budget
    c. Open position via IG API
    d. Verify deal confirmation
    e. Track position in database
9.  FOR EACH existing position:
    a. Adjust trailing stops if price has moved favorably
10. Save tick results (signals, trades, status)
11. Complete tick record in database
```

### Key Source Files

| File                         | Purpose                                |
| ---------------------------- | -------------------------------------- |
| `src/trigger/trading-bot.ts` | Trigger.dev task definitions           |
| `src/bot/tick.ts`            | Main tick orchestrator                 |
| `src/bot/config.ts`          | Config loader (file + env + overrides) |
| `src/bot/schemas.ts`         | Zod v4 schemas, types, defaults        |
| `src/bot/strategy-runner.ts` | 4 strategy implementations             |
| `src/bot/position-sizer.ts`  | Risk-based position sizing             |
| `src/bot/executor.ts`        | Trade execution + deal confirmation    |
| `src/bot/circuit-breaker.ts` | Safety circuit breaker logic           |
| `src/bot/state.ts`           | SQLite CRUD for all tables             |
| `src/bot/logger.ts`          | Structured JSON logger                 |
| `src/lib/indicators.ts`      | SMA, ATR, Bollinger Bands, S/R levels  |
| `src/db/schema.ts`           | Drizzle ORM table definitions          |
| `src/db/connection.ts`       | SQLite connection singleton            |

## Configuration

The bot loads config from three sources (higher priority overrides lower):

1. **Explicit overrides** (passed to `loadBotConfig()`)
2. **Environment variables** (`IG_API_KEY`, `BOT_STRATEGY`, etc.)
3. **Config file** (`bot-config.json` in project root)

### Minimum Viable Config

```json
{
  "intervalMinutes": 15,
  "apiKey": "your-key",
  "username": "your-username",
  "password": "your-password",
  "isDemo": true,
  "watchlist": [
    { "epic": "IX.D.FTSE.DAILY.IP", "expiry": "DFB", "currencyCode": "GBP" }
  ],
  "strategy": "trend-following"
}
```

Everything else has sensible defaults.

### Environment Variables

| Variable       | Maps To           | Example           |
| -------------- | ----------------- | ----------------- |
| `IG_API_KEY`   | `apiKey`          | `abc123...`       |
| `IG_USERNAME`  | `username`        | `myuser`          |
| `IG_PASSWORD`  | `password`        | `secret`          |
| `IG_DEMO`      | `isDemo`          | `true`            |
| `BOT_STRATEGY` | `strategy`        | `trend-following` |
| `BOT_INTERVAL` | `intervalMinutes` | `15`              |
| `BOT_DB_PATH`  | `dbPath`          | `./data/bot.db`   |

### Full Config Reference

#### Required Fields

| Field             | Type            | Description                            |
| ----------------- | --------------- | -------------------------------------- |
| `intervalMinutes` | `5\|10\|15\|60` | Tick frequency in minutes              |
| `apiKey`          | string          | IG Markets API key                     |
| `username`        | string          | IG account identifier                  |
| `password`        | string          | IG account password                    |
| `watchlist`       | array           | Instruments to monitor (see below)     |
| `strategy`        | enum            | Strategy to run (see Strategies below) |

#### Optional Fields with Defaults

| Field            | Default           | Description                     |
| ---------------- | ----------------- | ------------------------------- |
| `timezone`       | `"Europe/London"` | IANA timezone for cron schedule |
| `isDemo`         | `true`            | Use IG demo environment         |
| `dbPath`         | `"bot.db"`        | SQLite database file path       |
| `strategyParams` | _(see below)_     | Indicator tuning parameters     |
| `risk`           | _(see below)_     | Risk management parameters      |
| `circuitBreaker` | _(see below)_     | Circuit breaker thresholds      |

#### `strategyParams` Defaults

| Parameter             | Default | Description                   |
| --------------------- | ------- | ----------------------------- |
| `smaPeriodFast`       | 10      | Fast SMA period (days)        |
| `smaPeriodSlow`       | 20      | Slow SMA period (days)        |
| `atrPeriod`           | 14      | ATR calculation period (days) |
| `atrStopMultiplier`   | 1.5     | Stop = ATR x multiplier       |
| `atrTargetMultiplier` | 3.0     | Target = ATR x multiplier     |

#### `risk` Defaults

| Parameter            | Default | Description                        |
| -------------------- | ------- | ---------------------------------- |
| `maxRiskPerTradePct` | 0.01    | 1% of account per trade            |
| `maxOpenPositions`   | 5       | Max simultaneous positions         |
| `maxDailyLossPct`    | 0.03    | 3% max daily loss before stopping  |
| `maxMarginUtilPct`   | 0.5     | 50% max margin utilization         |
| `useGuaranteedStops` | false   | Guaranteed stops (extra IG charge) |

#### `circuitBreaker` Defaults

| Parameter              | Default | Description                     |
| ---------------------- | ------- | ------------------------------- |
| `maxConsecutiveLosses` | 3       | Trip after 3 consecutive losses |
| `maxConsecutiveErrors` | 5       | Trip after 5 consecutive errors |
| `cooldownMinutes`      | 60      | Minutes to wait after tripping  |
| `maxDailyLossPct`      | 0.05    | Trip if daily loss exceeds 5%   |

## Strategies

### `trend-following`

Uses SMA crossover to detect trend direction and ATR for stops/targets.

- **Entry BUY**: Fast SMA crosses above slow SMA + overall trend is UP
- **Entry SELL**: Fast SMA crosses below slow SMA + overall trend is DOWN
- **Exit**: Opposite crossover signal
- **Stop**: Entry price - (ATR x `atrStopMultiplier`)
- **Target**: Entry price + (ATR x `atrTargetMultiplier`)

### `breakout`

Detects price breaking out of recent support/resistance levels.

- **Entry BUY**: Price breaks above resistance + ATR confirms volatility expansion
- **Entry SELL**: Price breaks below support + ATR confirms volatility expansion
- **Exit**: Price returns inside support/resistance range
- **Stop**: Below the breakout level (support/resistance)
- **Target**: Breakout distance projected from breakout level

### `mean-reversion`

Uses Bollinger Bands to identify overextended price moves.

- **Entry BUY**: Price touches/breaches lower Bollinger Band
- **Entry SELL**: Price touches/breaches upper Bollinger Band
- **Exit**: Price returns to middle Bollinger Band (SMA)
- **Stop**: Beyond the outer band
- **Target**: Middle band (mean)

### `sentiment-contrarian`

Fades extreme IG client sentiment readings.

- **Entry BUY**: Client sentiment is >75% short (crowd is bearish, go long)
- **Entry SELL**: Client sentiment is >75% long (crowd is bullish, go short)
- **Exit**: Sentiment normalizes (moves back toward 50/50)
- **Stop**: ATR-based
- **Target**: ATR-based

## Common Workflows

### Set Up the Bot for the First Time

1. Help the user create a `bot-config.json`:
   - Ask which instruments they want to watch (use `ig_search_markets`)
   - Ask which strategy (`trend-following` is recommended for beginners)
   - Confirm demo mode
   - Use default risk/circuit breaker settings to start
2. Verify IG credentials work: `ig_login` then `ig_session_status`
3. Run database migration: `npm run db:migrate`
4. Update `trigger.config.ts` with their project ref
5. Deploy: `npx trigger.dev deploy`

### Run a Manual Test Tick

Use the `trading-bot-manual` task from the Trigger.dev dashboard. Pass config
overrides in the payload if needed:

```json
{
  "configOverrides": {
    "isDemo": true,
    "watchlist": [
      { "epic": "IX.D.FTSE.DAILY.IP", "expiry": "DFB", "currencyCode": "GBP" }
    ]
  }
}
```

### Check Why the Bot Stopped Trading

1. Check the Trigger.dev dashboard for task execution history
2. Check the `ticks` table for recent tick status/errors
3. Check circuit breaker state:
   - Query `bot_state` table for key `"circuitBreaker"`
   - If `tripped: true`, check `cooldownUntil` to see when it resets
   - Common trip reasons: consecutive losses, daily loss limit, API errors
4. Check IG session status — token may have expired

### Change the Strategy

Update `strategy` in `bot-config.json` and redeploy. The bot will start using
the new strategy on the next tick. Existing positions opened by the previous
strategy will still be managed (trailing stops, exit signals).

### Adjust Risk Parameters

Update the `risk` section in `bot-config.json`:

- Reduce `maxRiskPerTradePct` to trade smaller sizes
- Reduce `maxOpenPositions` to limit exposure
- Reduce `maxDailyLossPct` for tighter daily loss control
- Set `useGuaranteedStops: true` if you want guaranteed fills on stops

### Add a New Instrument

Add an entry to the `watchlist` array:

1. Use `ig_search_markets` to find the epic
2. Use `ig_market` to check the expiry and currency
3. Add to `bot-config.json`:
   ```json
   { "epic": "CS.D.GBPUSD.TODAY.IP", "expiry": "-", "currencyCode": "GBP" }
   ```
4. Redeploy

### Review Bot Performance

1. Query the `ticks` table for recent tick history
2. Query the `trades` table for executed trades and their status
3. Query the `signals` table for signals generated (including skipped ones)
4. Query the `positions` table for open/closed position P&L
5. Use `ig_activity_history` and `ig_transaction_history` for IG's own records

## Database Schema

### `ticks`

| Column                | Type    | Description                     |
| --------------------- | ------- | ------------------------------- |
| `id`                  | integer | Auto-increment primary key      |
| `started_at`          | text    | ISO timestamp                   |
| `completed_at`        | text    | ISO timestamp (null if running) |
| `status`              | text    | running/completed/skipped/error |
| `instruments_scanned` | integer | Count of instruments processed  |
| `signals_generated`   | integer | Count of signals produced       |
| `trades_executed`     | integer | Count of trades placed          |
| `error`               | text    | Error message if status=error   |
| `metadata`            | text    | JSON metadata blob              |

### `signals`

| Column            | Type    | Description                        |
| ----------------- | ------- | ---------------------------------- |
| `id`              | integer | Auto-increment primary key         |
| `tick_id`         | integer | FK to ticks                        |
| `epic`            | text    | Instrument epic                    |
| `strategy`        | text    | Which strategy generated this      |
| `action`          | text    | buy/sell/close/hold                |
| `signal_type`     | text    | entry/exit/adjust                  |
| `confidence`      | real    | Signal confidence (0-1)            |
| `price_at_signal` | real    | Market price when signal generated |
| `suggested_stop`  | real    | Recommended stop level             |
| `suggested_limit` | real    | Recommended target level           |
| `suggested_size`  | real    | Recommended position size          |
| `acted`           | integer | Whether trade was executed (0/1)   |
| `skip_reason`     | text    | Why signal was not acted on        |
| `indicator_data`  | text    | JSON blob of indicator values      |

### `trades`

| Column              | Type    | Description                 |
| ------------------- | ------- | --------------------------- |
| `id`                | integer | Auto-increment primary key  |
| `tick_id`           | integer | FK to ticks                 |
| `signal_id`         | integer | FK to signals (nullable)    |
| `deal_reference`    | text    | IG deal reference           |
| `deal_id`           | text    | IG deal ID                  |
| `epic`              | text    | Instrument epic             |
| `direction`         | text    | BUY/SELL                    |
| `size`              | real    | Position size               |
| `order_type`        | text    | MARKET/LIMIT/STOP           |
| `execution_price`   | real    | Actual fill price           |
| `stop_level`        | real    | Stop level set              |
| `limit_level`       | real    | Target level set            |
| `status`            | text    | OPEN/REJECTED/PENDING       |
| `reject_reason`     | text    | Rejection reason from IG    |
| `confirmation_data` | text    | Full deal confirmation JSON |

### `positions`

| Column          | Type    | Description                |
| --------------- | ------- | -------------------------- |
| `id`            | integer | Auto-increment primary key |
| `deal_id`       | text    | IG deal ID (unique)        |
| `epic`          | text    | Instrument epic            |
| `direction`     | text    | BUY/SELL                   |
| `size`          | real    | Position size              |
| `entry_price`   | real    | Entry fill price           |
| `current_stop`  | real    | Current stop level         |
| `current_limit` | real    | Current target level       |
| `strategy`      | text    | Strategy that opened this  |
| `status`        | text    | open/closed/unknown        |
| `exit_price`    | real    | Exit fill price            |
| `realized_pnl`  | real    | Realized P&L after close   |
| `opened_at`     | text    | ISO timestamp              |
| `closed_at`     | text    | ISO timestamp              |

### `bot_state`

| Column       | Type | Description               |
| ------------ | ---- | ------------------------- |
| `key`        | text | State key (primary key)   |
| `value`      | text | JSON value blob           |
| `updated_at` | text | Last update ISO timestamp |

Used for circuit breaker state, daily counters, and other persistent bot state.

## Limitations

- **No volume data** — IG API does not provide volume in OHLC data; volume-based
  indicators are not available
- **Single strategy per deployment** — the bot runs one strategy across all
  watchlist instruments; multi-strategy requires multiple deployments
- **No backtesting** — strategies have not been validated against historical data;
  always test on demo first
- **Rate limits** — IG allows ~60 requests/minute; with 5+ instruments on a
  5-minute interval, you may approach limits
- **No built-in notifications** — the bot logs results but does not send alerts;
  use Trigger.dev dashboard for monitoring
