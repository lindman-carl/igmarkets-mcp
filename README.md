# IG Markets OpenClaw Plugin

Trade stocks, CFDs, and spread bets via the IG Markets REST API. This OpenClaw
plugin provides **53 tools** for authentication, positions, orders, market data,
watchlists, sentiment, and cost analysis — plus an **automated trading bot** that
runs on a cron schedule via Trigger.dev.

## Features

- **53 trading tools** — session management, positions, working orders, market
  search, price history, watchlists, sentiment, cost analysis
- **6 trading skills** — market analysis, risk management, CFD trading, portfolio
  management, trading strategies, and automated bot guidance
- **Automated trading bot** — cron-scheduled tick-based bot with 4 built-in
  strategies, risk management, circuit breaker, and SQLite state persistence
- **Demo-first safety** — defaults to IG demo environment; trade approval prompts
  before any order execution

## Quick Start

### 1. Install the plugin

```bash
openclaw plugins install igmarkets
```

Or from a local directory:

```bash
openclaw plugins install ./
```

### 2. Configure credentials

Add to your `openclaw.json`:

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
          isDemo: true,
          tradeApproval: true,
        },
      },
    },
  },
}
```

### 3. Start trading

Ask your AI agent to look up a market, check positions, or open a trade. The
plugin auto-authenticates at startup if credentials are configured.

```text
> Search for Apple stock on IG Markets
> Show me my open positions
> What's the current FTSE 100 price?
```

## Plugin Tools (53)

All tools are prefixed with `ig_`.

| Category   | Count | Examples                                      |
| ---------- | ----- | --------------------------------------------- |
| Session    | 8     | `ig_login`, `ig_logout`, `ig_session_status`  |
| Accounts   | 9     | `ig_accounts`, `ig_activity_history`          |
| Dealing    | 10    | `ig_create_position`, `ig_close_position`     |
| Markets    | 8     | `ig_search_markets`, `ig_market`, `ig_prices` |
| Watchlists | 6     | `ig_watchlists`, `ig_create_watchlist`        |
| Sentiment  | 3     | `ig_client_sentiment`, `ig_related_sentiment` |
| General    | 9     | `ig_costs_open`, `ig_applications`            |

See [AGENTS.md](./AGENTS.md) for the full tool reference.

## Trading Skills

| Skill                  | Use When                                                 |
| ---------------------- | -------------------------------------------------------- |
| `igmarkets`            | General tool reference and basic workflows               |
| `portfolio-management` | Portfolio review, P&L analysis, exposure, rebalancing    |
| `cfd-trading`          | Opening/closing CFDs, margin, leverage, DFB, spread bets |
| `market-analysis`      | Price analysis, sentiment, multi-timeframe review        |
| `risk-management`      | Position sizing, stop strategies, risk/reward            |
| `trading-strategies`   | Trend, breakout, mean-reversion, contrarian strategies   |
| `trading-bot`          | Automated bot architecture, configuration, and operation |

---

## Automated Trading Bot

The plugin includes an automated trading bot that runs on a cron schedule via
[Trigger.dev](https://trigger.dev). It periodically fetches market data, runs
strategy logic against technical indicators, and executes trades through the IG
Markets API.

### Architecture

```bash
Trigger.dev (cron schedule)
  |
  v
executeTick()          ← Main orchestrator
  |
  |-- Load state       ← SQLite via Drizzle ORM
  |-- Circuit breaker  ← Safety check
  |-- Authenticate     ← IG Markets OAuth
  |-- Fetch data       ← Candles, sentiment, market details
  |-- Run strategies   ← 4 built-in strategies
  |-- Size positions   ← Risk-based sizing
  |-- Execute trades   ← IG API + deal confirmation
  |-- Update stops     ← Trailing stop adjustments
  |-- Save state       ← Persist tick results
  v
Done (wait for next tick)
```

### Built-in Strategies

| Strategy               | Description                                                       |
| ---------------------- | ----------------------------------------------------------------- |
| `trend-following`      | SMA crossover (fast/slow) with ATR-based stops and trend filter   |
| `breakout`             | Price breaks above/below support/resistance with ATR confirmation |
| `mean-reversion`       | Bollinger Band reversals when price is extended from the mean     |
| `sentiment-contrarian` | Fade extreme IG client sentiment (>75% one-sided)                 |

### Safety Features

- **Demo mode by default** — `isDemo: true` unless explicitly overridden
- **Circuit breaker** — stops trading after consecutive losses, errors, or daily loss limit
- **Risk-based sizing** — max 1% of account per trade (configurable)
- **Max position limits** — configurable cap on open positions
- **Deal confirmation** — every trade is verified via `ig_deal_confirmation`
- **No retries** — Trigger.dev tasks are set to `maxAttempts: 1` to prevent duplicate trades

### Bot Setup

#### Prerequisites

- Node.js 20+
- [Trigger.dev](https://trigger.dev) account (free tier available)
- IG Markets account (demo recommended)

#### 1. Install dependencies

```bash
pnpm install
```

#### 2. Run database migrations

The bot uses SQLite for state persistence. Migrations run automatically on first
tick, or you can run them manually:

```bash
pnpm run db:migrate
```

#### 3. Configure the bot

Create a `bot-config.json` in the project root:

```json
{
  "intervalMinutes": 15,
  "timezone": "Europe/London",
  "apiKey": "your-ig-api-key",
  "username": "your-ig-username",
  "password": "your-ig-password",
  "isDemo": true,
  "watchlist": [
    { "epic": "IX.D.FTSE.DAILY.IP", "expiry": "DFB", "currencyCode": "GBP" },
    { "epic": "IX.D.DAX.DAILY.IP", "expiry": "DFB", "currencyCode": "EUR" }
  ],
  "strategy": "trend-following",
  "strategyParams": {
    "smaPeriodFast": 10,
    "smaPeriodSlow": 20,
    "atrPeriod": 14,
    "atrStopMultiplier": 1.5,
    "atrTargetMultiplier": 3.0
  },
  "risk": {
    "maxRiskPerTradePct": 0.01,
    "maxOpenPositions": 5,
    "maxDailyLossPct": 0.03,
    "maxMarginUtilPct": 0.5,
    "useGuaranteedStops": false
  },
  "circuitBreaker": {
    "maxConsecutiveLosses": 3,
    "maxConsecutiveErrors": 5,
    "cooldownMinutes": 60,
    "maxDailyLossPct": 0.05
  }
}
```

Or use environment variables:

| Variable       | Description                           | Default  |
| -------------- | ------------------------------------- | -------- |
| `IG_API_KEY`   | IG Markets API key                    | —        |
| `IG_USERNAME`  | IG account username                   | —        |
| `IG_PASSWORD`  | IG account password                   | —        |
| `IG_DEMO`      | Use demo environment (`true`/`false`) | `true`   |
| `BOT_STRATEGY` | Strategy name                         | —        |
| `BOT_INTERVAL` | Tick interval in minutes              | —        |
| `BOT_DB_PATH`  | Path to SQLite database               | `bot.db` |

Config priority: explicit overrides > environment variables > `bot-config.json`.

#### 4. Configure Trigger.dev

Update `trigger.config.ts` with your project ref:

```ts
import { defineConfig } from "@trigger.dev/sdk/v3";

export default defineConfig({
  project: "proj_your-project-ref",
  dirs: ["./src/trigger"],
  retries: {
    enabledInDev: false,
    default: { maxAttempts: 1 },
  },
  maxDuration: 120,
});
```

#### 5. Deploy

```bash
npx trigger.dev deploy
```

The bot will run every 15 minutes during market hours (Mon-Fri 08:00-16:00
London time) by default. The schedule is configurable via `intervalMinutes`.

#### 6. Manual trigger (testing)

Use the `trading-bot-manual` task from the Trigger.dev dashboard to run a
one-off tick with optional config overrides.

### Bot Configuration Reference

#### `intervalMinutes` (required)

Tick interval: `5`, `10`, `15`, or `60` minutes. Determines how often the bot
checks markets and runs strategy logic. Recommended: `15` for most strategies.

#### `watchlist` (required)

Array of instruments to monitor each tick:

```json
[{ "epic": "IX.D.FTSE.DAILY.IP", "expiry": "DFB", "currencyCode": "GBP" }]
```

- `epic` — IG instrument identifier (use `ig_search_markets` to find)
- `expiry` — typically `"DFB"` for daily-funded CFDs, or `"-"` for non-expiring
- `currencyCode` — `"GBP"`, `"USD"`, `"EUR"`, etc.

#### `strategy` (required)

One of: `"trend-following"`, `"breakout"`, `"mean-reversion"`,
`"sentiment-contrarian"`.

#### `strategyParams` (optional)

Fine-tune strategy indicator parameters. All fields have sensible defaults:

| Parameter             | Default | Description                   |
| --------------------- | ------- | ----------------------------- |
| `smaPeriodFast`       | 10      | Fast SMA period (days)        |
| `smaPeriodSlow`       | 20      | Slow SMA period (days)        |
| `atrPeriod`           | 14      | ATR calculation period (days) |
| `atrStopMultiplier`   | 1.5     | Stop distance = ATR x this    |
| `atrTargetMultiplier` | 3.0     | Target distance = ATR x this  |

#### `risk` (optional)

| Parameter            | Default | Description                         |
| -------------------- | ------- | ----------------------------------- |
| `maxRiskPerTradePct` | 0.01    | Max 1% of account risked per trade  |
| `maxOpenPositions`   | 5       | Max simultaneous open positions     |
| `maxDailyLossPct`    | 0.03    | Max 3% daily loss before stopping   |
| `maxMarginUtilPct`   | 0.5     | Max 50% margin utilization          |
| `useGuaranteedStops` | false   | Use guaranteed stops (extra charge) |

#### `circuitBreaker` (optional)

| Parameter              | Default | Description                                   |
| ---------------------- | ------- | --------------------------------------------- |
| `maxConsecutiveLosses` | 3       | Trip after 3 consecutive losing trades        |
| `maxConsecutiveErrors` | 5       | Trip after 5 consecutive API/execution errors |
| `cooldownMinutes`      | 60      | Wait 60 minutes before resuming after trip    |
| `maxDailyLossPct`      | 0.05    | Trip if daily loss exceeds 5% of account      |

### Database

The bot uses SQLite (via Drizzle ORM) with 5 tables:

| Table       | Purpose                                         |
| ----------- | ----------------------------------------------- |
| `ticks`     | Record of each bot execution cycle              |
| `signals`   | Strategy signals generated (entry/exit/adjust)  |
| `trades`    | Trade execution records with deal confirmations |
| `positions` | Bot-tracked position lifecycle (open to close)  |
| `bot_state` | Key-value store for circuit breaker state, etc. |

Database files are excluded from git (see `.gitignore`).

### Scripts

| Script                 | Description                 |
| ---------------------- | --------------------------- |
| `pnpm run build`       | Compile TypeScript          |
| `pnpm run typecheck`   | Type-check without emitting |
| `pnpm run db:generate` | Generate Drizzle migrations |
| `pnpm run db:push`     | Push schema to database     |
| `pnpm run db:studio`   | Open Drizzle Studio (GUI)   |
| `pnpm run db:migrate`  | Run pending migrations      |

## Development

### Project Structure

```bash
igmarkets-mcp/
  index.ts                    # Plugin entry point
  trigger.config.ts           # Trigger.dev configuration
  bot-config.json             # Bot configuration (create this)
  openclaw.plugin.json        # Plugin manifest
  AGENTS.md                   # AI agent guidelines
  drizzle/                    # Database migrations
  skills/                     # Trading skills for AI agents
    igmarkets/
    cfd-trading/
    market-analysis/
    portfolio-management/
    risk-management/
    trading-bot/
    trading-strategies/
  src/
    ig-client.ts              # IG Markets REST API client
    tools/                    # 53 plugin tools
    lib/
      indicators.ts           # Technical indicators (SMA, ATR, Bollinger)
    db/
      schema.ts               # Drizzle table definitions
      connection.ts           # SQLite connection singleton
      migrate.ts              # Programmatic migration runner
    bot/
      schemas.ts              # Zod v4 schemas and types
      state.ts                # State persistence CRUD
      config.ts               # Bot config loader
      tick.ts                 # Main tick orchestrator
      strategy-runner.ts      # 4 strategy implementations
      position-sizer.ts       # Risk-based position sizing
      executor.ts             # Trade execution via IG API
      circuit-breaker.ts      # Trading safety guard
      logger.ts               # Structured trade journal
    trigger/
      trading-bot.ts          # Trigger.dev scheduled tasks
```

### Key Conventions

- **TypeScript strict mode** with `"module": "Node16"`
- **Zod v4** for all schema validation — import from `"zod/v4"`
- **Drizzle ORM** with `better-sqlite3` for database
- **`.js` extension imports** throughout (Node16 module resolution)
- All 53 tools use `getClient()` singleton — the bot uses its own `IGClient` instance

## License

MIT
