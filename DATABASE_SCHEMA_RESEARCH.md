# Trading Bot Database Schema — Research & Implementation Guide

## Executive Summary

This document provides:

1. **Standard trading platform database patterns** (equity curves, market data caching, state management)
2. **Drizzle ORM best practices** for SQLite table definitions, constraints, and migrations
3. **Implementation strategy** for the 5 schema changes (remove 3 columns, add 4 new tables)

---

## Part 1: Standard Trading Platform Database Patterns

### 1.1 Typical Trading Platform Schema Layers

Professional trading platforms organize data into these logical layers:

#### **Account & Credentials Layer**

- `accounts` — trading account metadata (NOT credentials)
- `account_credentials` — encrypted API credentials (separate table for security)
- `account_snapshots` — historical account balance/equity (equity curve)

**Why separate?** Credentials should be encrypted and rotated independently. Historical snapshots enable:

- Equity curve charting
- Drawdown analysis
- Performance metrics (Sharpe ratio, etc.)

#### **Market Data Layer**

- `markets` / `instruments` — reference data (epic, min size, tick size, margin factor, trading hours)
- `candles` — historical OHLCV data (cached locally for backtesting & quick lookups)
- `ticks` — tick-level price updates (optional, expensive to store)

**Why cache locally?** Reduces API calls, enables historical analysis, fast lookups during signal generation.

#### **Trading Activity Layer**

- `strategies` — strategy definitions & parameters
- `signals` — signals generated (entry/exit conditions met)
- `trades` — executed trades (filled orders)
- `positions` — open positions & their lifecycle
- `orders` — pending/working orders (limit, stop)

#### **State & Circuit Breaker Layer**

- `risk_state` — circuit breaker state (daily loss limit, max positions, etc.)
- `bot_state` (legacy) — key-value store (being replaced by `risk_state`)

#### **Analysis & Reporting**

- `account_snapshots` — balance/equity curve over time
- `performance_metrics` — calculated Sharpe, Sortino, max drawdown
- `trade_journal` — annotated trades with rationale & lessons learned

---

### 1.2 Your Current Schema vs. Industry Standard

**Your current schema (7 tables):**

```
✓ strategies       — strategy definitions
✓ accounts         — account metadata (✗ HAS CREDENTIALS)
✓ ticks            — bot execution cycles
✓ signals          — generated signals
✓ trades           — executed trades
✓ positions        — open positions
✓ bot_state        — KV state store
```

**Missing industry-standard tables:**

```
✗ instruments      — market reference data (epic, min size, tick size, etc.)
✗ account_snapshots — equity curve (balance/equity over time)
✗ candles          — local price cache (OHLCV data for fast lookups)
✗ risk_state       — typed circuit breaker state (replaces bot_state KV)
```

**Security issue:**

```
✗ accounts.igApiKey, igUsername, igPassword should NOT be in main DB
  → Move to encrypted secrets (env vars, vault, or separate encrypted table)
  → Accounts table should only reference credentials by ID
```

---

### 1.3 Why These Tables Matter

#### **`instruments` Table**

Stores market reference data to avoid repeated API calls:

```typescript
{
  epic: "IX.D.FTSE.DAILY.IP",      // unique market identifier
  name: "FTSE 100 Daily",
  minSize: 0.5,
  tickSize: 0.1,
  marginFactor: 0.05,              // margin requirement
  currencyCode: "GBP",
  expiry: "DFB",                   // expiry type
  tradingHours: "08:00-16:30",     // market hours (optional)
  lastSynced: "2026-04-01T12:00:00Z"
}
```

**Use cases:**

- Validate position size against `minSize`
- Calculate margin requirement before opening trade
- Screen markets that meet liquidity/margin criteria
- Fast lookups without hitting IG API every tick

#### **`account_snapshots` Table**

Historical balance/equity for equity curve tracking:

```typescript
{
  accountId: 1,
  balance: 50000.00,               // cash available
  equity: 52350.50,                // balance + unrealized P&L
  margin: 2400.00,                 // margin used
  pnl: 2350.50,                    // unrealized P&L
  timestamp: "2026-04-01T12:00:00Z"
}
```

**Use cases:**

- Plot equity curve over time
- Calculate max drawdown
- Monitor margin utilization
- Detect abnormal equity swings (circuit breaker trigger)

#### **`candles` Table**

Local price cache for OHLCV data:

```typescript
{
  epic: "IX.D.FTSE.DAILY.IP",
  resolution: "MINUTE_5",          // MINUTE, MINUTE_5, HOUR, DAY, etc.
  timestamp: "2026-04-01T12:05:00Z",
  open: 8150.5,
  high: 8155.3,
  low: 8148.2,
  close: 8152.8,
  volume: 125000
}
```

**Use cases:**

- Fast SMA/ATR calculations (don't parse API responses)
- Backtest strategies without API calls
- Local price snapshots for entry/exit validation
- Technical analysis indicators

#### **`risk_state` Table** (replaces KV `bot_state`)

Typed circuit breaker state:

```typescript
{
  accountId: 1,
  stateKey: "daily_loss_limit",    // strongly typed instead of KV
  stateValue: 5000.00,             // max loss allowed today
  isTriggered: false,              // circuit breaker active?
  lastReset: "2026-04-01T00:00:00Z",
  metadata: { reason: "...", triggerTime: "..." }
}
```

**Why typed?** Type safety, queryability, easier migration.

---

### 1.4 Common Index Patterns in Trading DBs

**Fast lookups by epic + resolution (candles):**

```sql
CREATE INDEX candles_epic_resolution_timestamp ON candles(epic, resolution, timestamp DESC)
```

**Fast lookups by account + date (account_snapshots):**

```sql
CREATE INDEX snapshots_account_timestamp ON account_snapshots(accountId, timestamp DESC)
```

**Fast lookups by deal status (positions):**

```sql
CREATE INDEX positions_status_account ON positions(status, accountId)
```

**Fast lookups by strategy + signal type (signals):**

```sql
CREATE INDEX signals_strategy_type ON signals(strategy, signalType, createdAt DESC)
```

---

## Part 2: Drizzle ORM SQLite Best Practices

### 2.1 Table Definition Patterns

#### **Columns: Types & Modes**

```typescript
import { sqliteTable, index } from "drizzle-orm/sqlite-core";
import * as t from "drizzle-orm/sqlite-core";

export const example = sqliteTable(
  "example",
  {
    // Primary Keys
    id: t.int().primaryKey({ autoIncrement: true }),

    // Text Columns
    name: t.text().notNull().unique(),
    description: t.text(),

    // JSON Columns (SQLite text with mode: 'json')
    metadata: t.text({ mode: "json" }),
    config: t.text({ mode: "json" }).$type<ConfigType>(), // typed JSON

    // Boolean (stored as 0/1 integer)
    isActive: t.int({ mode: "boolean" }).notNull().default(true),

    // Numeric
    price: t.real().notNull(), // float
    quantity: t.int().notNull(), // integer
    balance: t.real().notNull(), // for currency/decimals

    // Foreign Keys
    accountId: t.int().references(() => accounts.id),

    // Timestamps (store as ISO 8601 strings)
    createdAt: t.text().notNull(),
    updatedAt: t.text().notNull(),
  },
  (table) => [
    // Indexes
    index("example_account_id_idx").on(table.accountId),
    index("example_created_at_idx").on(table.createdAt),
  ],
);
```

#### **Unique Constraints**

```typescript
// Single column unique
export const accounts = sqliteTable(
  "accounts",
  {
    name: t.text().notNull().unique(),
    // ...
  },
  (table) => [index("accounts_name_unique").on(table.name)],
);

// Multi-column unique
export const candles = sqliteTable(
  "candles",
  {
    epic: t.text().notNull(),
    resolution: t.text().notNull(),
    timestamp: t.text().notNull(),
    // ...
  },
  (table) => [
    // Unique constraint on (epic, resolution, timestamp)
    unique().on(table.epic, table.resolution, table.timestamp),
  ],
);
```

#### **Foreign Keys (Optional in SQLite)**

```typescript
export const positions = sqliteTable("positions", {
  id: t.int().primaryKey({ autoIncrement: true }),
  accountId: t
    .int()
    .notNull()
    .references(() => accounts.id), // explicit FK reference
  // ...
});
```

**Note:** SQLite requires `PRAGMA foreign_keys = ON` to enforce FKs. Use in connection setup.

---

### 2.2 Null Handling in SQLite

```typescript
// Nullable (optional)
status: t.text(),                        // can be NULL

// Not Null (required)
status: t.text().notNull(),

// Required with default
isActive: t.int({ mode: "boolean" })
  .notNull()
  .default(true),

// Optional with default (rarely used)
timezone: t.text().default("Europe/London"),
```

---

### 2.3 Column-Level Comments & Documentation

Drizzle doesn't generate SQL comments, so use TypeScript JSDoc:

```typescript
export const positions = sqliteTable("positions", {
  id: t.int().primaryKey({ autoIncrement: true }),

  /** FK to accounts (scoped per account) */
  accountId: t.int(),

  /** IG deal ID (unique across IG) */
  dealId: t.text().notNull().unique(),

  /** Instrument epic (e.g. "IX.D.FTSE.DAILY.IP") */
  epic: t.text().notNull(),

  /** "BUY" | "SELL" */
  direction: t.text().notNull(),
});
```

---

## Part 3: SQLite Migration Strategy & Constraints

### 3.1 SQLite ALTER TABLE Limitations

SQLite has limited ALTER TABLE support:

| Operation         | Supported? | Notes                      |
| ----------------- | ---------- | -------------------------- |
| ADD COLUMN        | ✓          | Works fine                 |
| DROP COLUMN       | ⚠️         | Requires table recreation  |
| RENAME COLUMN     | ⚠️         | Requires table recreation  |
| ALTER COLUMN TYPE | ✗          | Not supported              |
| ADD CONSTRAINT    | ⚠️         | Depends on constraint type |
| DROP CONSTRAINT   | ✗          | Requires table recreation  |

**Table recreation pattern (for DROP/RENAME/constraint changes):**

```sql
-- 1. Disable foreign keys temporarily
PRAGMA foreign_keys = OFF;

-- 2. Rename old table
ALTER TABLE accounts RENAME TO accounts_old;

-- 3. Create new table with updated schema
CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  -- ✗ removed: ig_api_key, ig_username, ig_password
  is_demo INTEGER DEFAULT true NOT NULL,
  strategy_id INTEGER NOT NULL,
  interval_minutes INTEGER DEFAULT 15 NOT NULL,
  timezone TEXT DEFAULT 'Europe/London' NOT NULL,
  is_active INTEGER DEFAULT true NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 4. Copy data (only non-dropped columns)
INSERT INTO accounts (id, name, is_demo, strategy_id, interval_minutes, timezone, is_active, created_at, updated_at)
SELECT id, name, is_demo, strategy_id, interval_minutes, timezone, is_active, created_at, updated_at FROM accounts_old;

-- 5. Recreate indexes
CREATE UNIQUE INDEX accounts_name_unique ON accounts (name);
CREATE INDEX accounts_strategy_id_idx ON accounts (strategy_id);
CREATE INDEX accounts_is_active_idx ON accounts (is_active);

-- 6. Drop old table
DROP TABLE accounts_old;

-- 7. Re-enable foreign keys
PRAGMA foreign_keys = ON;
```

---

### 3.2 Drizzle Migration Workflow

#### **Recommended: Use `drizzle-kit generate` (safe, reversible)**

```bash
# 1. Update your TypeScript schema (src/db/schema.ts)
# 2. Generate migration file
npm run db:generate -- --name="remove_creds_add_instruments"

# 3. Review generated SQL in drizzle/TIMESTAMP_migration_name/migration.sql
# 4. Apply migration
npm run db:migrate

# 5. Verify
npm run db:studio
```

#### **Alternative: Use `drizzle-kit push` (direct, not reversible)**

```bash
# ⚠️ Only for local dev (not production-safe)
npm run db:push
```

**Why `generate` is better:**

- ✓ Creates SQL file for code review
- ✓ Can be versioned in git
- ✓ Can be rolled back (if you keep old migration files)
- ✓ Reversible (down migration path)
- ✓ Works with migration tools (Flyway, Liquibase)

---

### 3.3 Generated Migration File Structure

Drizzle generates:

```
drizzle/
├── 0000_giant_bedlam.sql          # initial schema
├── 0001_remove_creds_add_instruments/
│   ├── migration.sql              # SQL change statements
│   └── snapshot.json              # schema snapshot (for diffing)
└── meta/
    └── _journal.json              # migration metadata
```

**Snapshot JSON** (for Drizzle's diffing algorithm):

```json
{
  "version": "7",
  "dialect": "sqlite",
  "tables": {
    "accounts": {
      "name": "accounts",
      "columns": [
        { "name": "id", "type": "integer", "primaryKey": true, ... },
        { "name": "name", "type": "text", ... }
      ]
    }
  }
}
```

---

## Part 4: Implementation Strategy for Schema Changes

### 4.1 Change 1: Remove 3 Columns from `accounts`

**Current columns to remove:**

- `igApiKey`
- `igUsername`
- `igPassword`

**After:** Store credentials in env vars or separate encrypted table.

**Updated `accounts` table (src/db/schema.ts):**

```typescript
export const accounts = sqliteTable(
  "accounts",
  {
    id: t.int().primaryKey({ autoIncrement: true }),
    name: t.text().notNull().unique(),
    // ✗ REMOVED: igApiKey, igUsername, igPassword
    isDemo: t.int("is_demo", { mode: "boolean" }).notNull().default(true),
    strategyId: t.int("strategy_id").notNull(),
    intervalMinutes: t.int("interval_minutes").notNull().default(15),
    timezone: t.text().notNull().default("Europe/London"),
    isActive: t.int("is_active", { mode: "boolean" }).notNull().default(true),
    createdAt: t.text("created_at").notNull(),
    updatedAt: t.text("updated_at").notNull(),
  },
  (table) => [
    index("accounts_strategy_id_idx").on(table.strategyId),
    index("accounts_is_active_idx").on(table.isActive),
  ],
);
```

**Generated migration (Drizzle will handle table recreation):**

```sql
-- Drizzle automatically detects column removal and generates
-- the table recreation logic with PRAGMA foreign_keys OFF
PRAGMA foreign_keys = OFF;
ALTER TABLE accounts RENAME TO accounts_old;

CREATE TABLE accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
  name TEXT NOT NULL UNIQUE,
  is_demo INTEGER DEFAULT true NOT NULL,
  strategy_id INTEGER NOT NULL,
  interval_minutes INTEGER DEFAULT 15 NOT NULL,
  timezone TEXT DEFAULT 'Europe/London' NOT NULL,
  is_active INTEGER DEFAULT true NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

INSERT INTO accounts SELECT id, name, is_demo, strategy_id, interval_minutes, timezone, is_active, created_at, updated_at FROM accounts_old;

DROP TABLE accounts_old;

CREATE UNIQUE INDEX accounts_name_unique ON accounts (name);
CREATE INDEX accounts_strategy_id_idx ON accounts (strategy_id);
CREATE INDEX accounts_is_active_idx ON accounts (is_active);

PRAGMA foreign_keys = ON;
```

---

### 4.2 Change 2: Add `instruments` Table

**New table definition (src/db/schema.ts):**

```typescript
export const instruments = sqliteTable(
  "instruments",
  {
    id: t.int().primaryKey({ autoIncrement: true }),

    /** Unique market identifier (e.g. "IX.D.FTSE.DAILY.IP") */
    epic: t.text().notNull().unique(),

    /** Market display name (e.g. "FTSE 100 Daily") */
    name: t.text().notNull(),

    /** Minimum deal size (e.g. 0.5 for FTSE) */
    minSize: t.real("min_size").notNull(),

    /** Tick size (minimum price movement, e.g. 0.1) */
    tickSize: t.real("tick_size").notNull(),

    /** Margin factor (e.g. 0.05 for 5% margin requirement) */
    marginFactor: t.real("margin_factor").notNull(),

    /** Currency code (e.g. "GBP", "USD") */
    currencyCode: t.text("currency_code").notNull(),

    /** Expiry type (e.g. "DFB" = Daily Funded Bet) */
    expiry: t.text().notNull(),

    /** Trading hours (optional, e.g. "08:00-16:30") */
    tradingHours: t.text("trading_hours"),

    /** ISO 8601 timestamp of last sync from IG API */
    lastSynced: t.text("last_synced").notNull(),

    /** ISO 8601 timestamp */
    createdAt: t.text("created_at").notNull(),
  },
  (table) => [
    index("instruments_epic_idx").on(table.epic),
    index("instruments_margin_factor_idx").on(table.marginFactor),
  ],
);
```

**Generated migration:**

```sql
CREATE TABLE `instruments` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `epic` text NOT NULL UNIQUE,
  `name` text NOT NULL,
  `min_size` real NOT NULL,
  `tick_size` real NOT NULL,
  `margin_factor` real NOT NULL,
  `currency_code` text NOT NULL,
  `expiry` text NOT NULL,
  `trading_hours` text,
  `last_synced` text NOT NULL,
  `created_at` text NOT NULL
);

CREATE UNIQUE INDEX instruments_epic_unique ON instruments (epic);
CREATE INDEX instruments_epic_idx ON instruments (epic);
CREATE INDEX instruments_margin_factor_idx ON instruments (margin_factor);
```

---

### 4.3 Change 3: Add `account_snapshots` Table

**New table definition (src/db/schema.ts):**

```typescript
export const accountSnapshots = sqliteTable(
  "account_snapshots",
  {
    id: t.int().primaryKey({ autoIncrement: true }),

    /** FK to accounts */
    accountId: t.int("account_id").notNull(),

    /** Available cash balance */
    balance: t.real().notNull(),

    /** Total equity (balance + unrealized P&L) */
    equity: t.real().notNull(),

    /** Margin used */
    margin: t.real().notNull(),

    /** Unrealized P&L */
    pnl: t.real().notNull(),

    /** ISO 8601 timestamp (snapshot time) */
    timestamp: t.text().notNull(),
  },
  (table) => [
    index("snapshots_account_id_timestamp_idx").on(
      table.accountId,
      table.timestamp,
    ),
    index("snapshots_timestamp_idx").on(table.timestamp),
  ],
);
```

**Generated migration:**

```sql
CREATE TABLE `account_snapshots` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `account_id` integer NOT NULL,
  `balance` real NOT NULL,
  `equity` real NOT NULL,
  `margin` real NOT NULL,
  `pnl` real NOT NULL,
  `timestamp` text NOT NULL
);

CREATE INDEX snapshots_account_id_timestamp_idx ON account_snapshots (account_id, timestamp);
CREATE INDEX snapshots_timestamp_idx ON account_snapshots (timestamp);
```

---

### 4.4 Change 4: Add `candles` Table

**New table definition (src/db/schema.ts):**

```typescript
export const candles = sqliteTable(
  "candles",
  {
    id: t.int().primaryKey({ autoIncrement: true }),

    /** Instrument epic (e.g. "IX.D.FTSE.DAILY.IP") */
    epic: t.text().notNull(),

    /** Resolution (e.g. "MINUTE", "MINUTE_5", "HOUR", "DAY") */
    resolution: t.text().notNull(),

    /** Candle open timestamp (ISO 8601) */
    timestamp: t.text().notNull(),

    /** Open price */
    open: t.real().notNull(),

    /** High price */
    high: t.real().notNull(),

    /** Low price */
    low: t.real().notNull(),

    /** Close price */
    close: t.real().notNull(),

    /** Volume */
    volume: t.real(),
  },
  (table) => [
    // Unique on (epic, resolution, timestamp)
    unique().on(table.epic, table.resolution, table.timestamp),

    // Fast lookups by epic + resolution
    index("candles_epic_resolution_timestamp_idx").on(
      table.epic,
      table.resolution,
      table.timestamp,
    ),

    // Fast purge by old timestamp
    index("candles_timestamp_idx").on(table.timestamp),
  ],
);
```

**Generated migration:**

```sql
CREATE TABLE `candles` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `epic` text NOT NULL,
  `resolution` text NOT NULL,
  `timestamp` text NOT NULL,
  `open` real NOT NULL,
  `high` real NOT NULL,
  `low` real NOT NULL,
  `close` real NOT NULL,
  `volume` real
);

CREATE UNIQUE INDEX candles_epic_resolution_timestamp_unique
  ON candles (epic, resolution, timestamp);

CREATE INDEX candles_epic_resolution_timestamp_idx
  ON candles (epic, resolution, timestamp);

CREATE INDEX candles_timestamp_idx ON candles (timestamp);
```

---

### 4.5 Change 5: Convert `bot_state` KV to Typed `risk_state`

**Current KV table (to be deprecated):**

```typescript
export const botState = sqliteTable("bot_state", {
  key: t.text().primaryKey(),
  value: t.text({ mode: "json" }).notNull(),
  updatedAt: t.text("updated_at").notNull(),
});
```

**New typed table (src/db/schema.ts):**

```typescript
export const riskState = sqliteTable(
  "risk_state",
  {
    id: t.int().primaryKey({ autoIncrement: true }),

    /** FK to accounts (NULL for global state) */
    accountId: t.int("account_id"),

    /** State key (e.g. "daily_loss_limit", "max_open_positions", "circuit_breaker_triggered") */
    stateKey: t.text("state_key").notNull(),

    /** State value (JSON or string, depending on key) */
    stateValue: t.text("state_value", { mode: "json" }),

    /** Is circuit breaker currently triggered? */
    isTriggered: t.int("is_triggered", { mode: "boolean" }).default(false),

    /** When circuit breaker was triggered */
    triggerTime: t.text("trigger_time"),

    /** When circuit breaker should reset (ISO 8601) */
    resetTime: t.text("reset_time"),

    /** Free-form metadata (reason, context, etc.) */
    metadata: t.text({ mode: "json" }),

    /** ISO 8601 timestamp of last update */
    updatedAt: t.text("updated_at").notNull(),
  },
  (table) => [
    // Unique on (accountId, stateKey)
    unique().on(table.accountId, table.stateKey),

    index("risk_state_account_id_idx").on(table.accountId),
    index("risk_state_is_triggered_idx").on(table.isTriggered),
  ],
);
```

**Reasons for new table:**

- ✓ Type-safe: `stateKey` is enumerable (not arbitrary string)
- ✓ Queryable: Can filter by `isTriggered`, `triggerTime`, etc.
- ✓ Account-scoped: Per-account circuit breaker state
- ✓ Easier to migrate & reason about

**Migration path:**

```sql
-- Create new table
CREATE TABLE `risk_state` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `account_id` integer,
  `state_key` text NOT NULL,
  `state_value` text,
  `is_triggered` integer DEFAULT false,
  `trigger_time` text,
  `reset_time` text,
  `metadata` text,
  `updated_at` text NOT NULL
);

CREATE UNIQUE INDEX risk_state_account_key_unique
  ON risk_state (account_id, state_key);

CREATE INDEX risk_state_account_id_idx ON risk_state (account_id);
CREATE INDEX risk_state_is_triggered_idx ON risk_state (is_triggered);

-- Keep bot_state for backward compatibility (migrate data if needed)
-- Or drop if clean break is acceptable:
-- DROP TABLE bot_state;
```

---

## Part 5: Step-by-Step Migration Execution

### 5.1 Pre-Migration Checklist

- [ ] Backup `bot.db`
- [ ] Stop bot processes
- [ ] No active trades/running ticks
- [ ] Test schema changes locally first

### 5.2 Generate & Review Migrations

```bash
# 1. Update src/db/schema.ts with all 4 changes
# 2. Generate migration
npm run db:generate -- --name="refactor_schema_remove_creds_add_market_data"

# 3. Review generated SQL in drizzle/TIMESTAMP_migration_name/
cat drizzle/TIMESTAMP_migration_name/migration.sql

# 4. If satisfied, apply
npm run db:migrate
```

### 5.3 Verify Migration Success

```bash
# Open Drizzle Studio to inspect
npm run db:studio

# Or manually query:
sqlite3 bot.db ".schema accounts"
sqlite3 bot.db ".schema instruments"
sqlite3 bot.db "SELECT COUNT(*) FROM instruments;"
```

### 5.4 Post-Migration Updates

- [ ] Update bot code to use new tables
- [ ] Add Zod schemas for new tables
- [ ] Add CRUD functions to `src/bot/state.ts`
- [ ] Update `src/bot/executor.ts` to populate `account_snapshots`
- [ ] Update signal generation to use `instruments` for validation
- [ ] Add candle caching logic

---

## Part 6: Drizzle ORM Query Examples

### 6.1 Insert with Validation

```typescript
import { InsertInstrumentSchema } from "./schemas.js";

export async function insertInstrument(
  db: BotDatabase,
  data: InsertInstrument,
): Promise<number> {
  const validated = InsertInstrumentSchema.parse(data);
  const result = await db
    .insert(instruments)
    .values(validated)
    .returning({ id: instruments.id });
  return result[0].id;
}
```

### 6.2 Query by Epic

```typescript
import { eq } from "drizzle-orm";

export async function getInstrument(
  db: BotDatabase,
  epic: string,
): Promise<InstrumentRow | null> {
  const rows = await db
    .select()
    .from(instruments)
    .where(eq(instruments.epic, epic));
  return rows[0] ?? null;
}
```

### 6.3 Bulk Insert Candles

```typescript
export async function insertCandles(
  db: BotDatabase,
  candleData: InsertCandle[],
): Promise<void> {
  if (candleData.length === 0) return;
  await db.insert(candles).values(candleData);
}
```

### 6.4 Query Candles with Filters

```typescript
import { eq, and, desc, gte, lte } from "drizzle-orm";

export async function getCandles(
  db: BotDatabase,
  epic: string,
  resolution: string,
  limit = 100,
): Promise<CandleRow[]> {
  return db
    .select()
    .from(candles)
    .where(and(eq(candles.epic, epic), eq(candles.resolution, resolution)))
    .orderBy(desc(candles.timestamp))
    .limit(limit);
}
```

### 6.5 Insert Account Snapshot

```typescript
export async function recordAccountSnapshot(
  db: BotDatabase,
  accountId: number,
  snapshot: {
    balance: number;
    equity: number;
    margin: number;
    pnl: number;
  },
): Promise<void> {
  await db.insert(accountSnapshots).values({
    accountId,
    ...snapshot,
    timestamp: new Date().toISOString(),
  });
}
```

### 6.6 Query Risk State

```typescript
import { eq, and, or, isNull } from "drizzle-orm";

export async function getRiskState(
  db: BotDatabase,
  accountId: number,
  stateKey: string,
): Promise<RiskStateRow | null> {
  const rows = await db
    .select()
    .from(riskState)
    .where(
      and(eq(riskState.accountId, accountId), eq(riskState.stateKey, stateKey)),
    );
  return rows[0] ?? null;
}

export async function getTriggeredCircuitBreakers(
  db: BotDatabase,
): Promise<RiskStateRow[]> {
  return db.select().from(riskState).where(eq(riskState.isTriggered, true));
}
```

---

## Part 7: Zod Schemas for New Tables

### 7.1 Instrument Schema

```typescript
import { z } from "zod/v4";

export const InstrumentSchema = z.object({
  id: z.number().int(),
  epic: z.string().min(1),
  name: z.string().min(1),
  minSize: z.number().positive(),
  tickSize: z.number().positive(),
  marginFactor: z.number().positive(),
  currencyCode: z.string().length(3),
  expiry: z.string().min(1),
  tradingHours: z.string().optional(),
  lastSynced: z.string().datetime(),
  createdAt: z.string().datetime(),
});

export const InsertInstrumentSchema = InstrumentSchema.omit({
  id: true,
  createdAt: true,
});

export type Instrument = z.infer<typeof InstrumentSchema>;
export type InsertInstrument = z.infer<typeof InsertInstrumentSchema>;
```

### 7.2 Candle Schema

```typescript
export const CandleSchema = z.object({
  id: z.number().int(),
  epic: z.string().min(1),
  resolution: z.enum([
    "SECOND",
    "MINUTE",
    "MINUTE_2",
    "MINUTE_5",
    "MINUTE_10",
    "MINUTE_15",
    "MINUTE_30",
    "HOUR",
    "HOUR_2",
    "HOUR_3",
    "HOUR_4",
    "DAY",
    "WEEK",
    "MONTH",
  ]),
  timestamp: z.string().datetime(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number().optional(),
});

export const InsertCandleSchema = CandleSchema.omit({ id: true });

export type Candle = z.infer<typeof CandleSchema>;
export type InsertCandle = z.infer<typeof InsertCandleSchema>;
```

### 7.3 Account Snapshot Schema

```typescript
export const AccountSnapshotSchema = z.object({
  id: z.number().int(),
  accountId: z.number().int(),
  balance: z.number(),
  equity: z.number(),
  margin: z.number(),
  pnl: z.number(),
  timestamp: z.string().datetime(),
});

export const InsertAccountSnapshotSchema = AccountSnapshotSchema.omit({
  id: true,
});

export type AccountSnapshot = z.infer<typeof AccountSnapshotSchema>;
export type InsertAccountSnapshot = z.infer<typeof InsertAccountSnapshotSchema>;
```

### 7.4 Risk State Schema

```typescript
export const RiskStateKeySchema = z.enum([
  "daily_loss_limit",
  "max_open_positions",
  "circuit_breaker_triggered",
  "max_correlation_limit",
  "max_sector_exposure",
]);

export const RiskStateSchema = z.object({
  id: z.number().int(),
  accountId: z.number().int().nullable(),
  stateKey: RiskStateKeySchema,
  stateValue: z.unknown(),
  isTriggered: z.boolean(),
  triggerTime: z.string().datetime().nullable(),
  resetTime: z.string().datetime().nullable(),
  metadata: z.unknown(),
  updatedAt: z.string().datetime(),
});

export const InsertRiskStateSchema = RiskStateSchema.omit({ id: true });

export type RiskState = z.infer<typeof RiskStateSchema>;
export type InsertRiskState = z.infer<typeof InsertRiskStateSchema>;
```

---

## Part 8: Credentials Security — Recommended Pattern

### 8.1 Remove Credentials from DB

**Current (unsafe):**

```typescript
accounts: {
  igApiKey: "...",    // ✗ in database
  igUsername: "...",
  igPassword: "...",
}
```

**Recommended (safe):**

```typescript
// src/db/schema.ts
accounts: {
  // no credentials
}

// src/config/credentials.ts
export async function getAccountCredentials(accountName: string) {
  // Option 1: Environment variables
  const apiKey = process.env[`IG_${accountName}_API_KEY`];
  const username = process.env[`IG_${accountName}_USERNAME`];
  const password = process.env[`IG_${accountName}_PASSWORD`];

  // Option 2: Secrets manager (AWS Secrets Manager, Vault, etc.)
  // const secret = await secretsManager.getSecret(`ig/${accountName}`);

  // Option 3: Encrypted separate table (with PRAGMA key)
  // const encrypted = await db.select().from(accountCredentials)...

  return { apiKey, username, password };
}
```

### 8.2 Use Environment Variables

```bash
# .env or Trigger.dev env vars
IG_DEMO_ACCOUNT_API_KEY=abc123
IG_DEMO_ACCOUNT_USERNAME=demo_user
IG_DEMO_ACCOUNT_PASSWORD=demo_pass

IG_LIVE_ACCOUNT_API_KEY=xyz789
IG_LIVE_ACCOUNT_USERNAME=live_user
IG_LIVE_ACCOUNT_PASSWORD=live_pass
```

### 8.3 Load at Initialization

```typescript
export async function initializeAccount(accountName: string) {
  const creds = await getAccountCredentials(accountName);
  const client = new IGClient({
    apiKey: creds.apiKey,
    username: creds.username,
    password: creds.password,
    isDemo: account.isDemo,
  });
  return client;
}
```

---

## Part 9: Migration Rollback Strategy

### 9.1 Keep Previous Migrations

Drizzle migrations are immutable. Never edit old migrations.

```
drizzle/
├── 0000_giant_bedlam.sql
├── 0001_remove_creds_add_instruments/
│   ├── migration.sql
│   └── snapshot.json
└── meta/
```

### 9.2 Rollback via Backup + Re-Apply

```bash
# If migration fails:
1. Restore bot.db from backup
2. Fix schema issue in src/db/schema.ts
3. Generate new migration with different name
4. Apply new migration
```

### 9.3 Manual Rollback (Last Resort)

```bash
# Restore old db
cp bot.db.backup bot.db

# Revert schema changes in src/db/schema.ts
# (remove new tables, re-add old columns)

# Generate rollback migration
npm run db:generate -- --name="rollback_migration"

# Review & apply
npm run db:migrate
```

---

## Summary Table: All Changes at a Glance

| Change                                       | Type     | Impact                          | Migration Strategy                  |
| -------------------------------------------- | -------- | ------------------------------- | ----------------------------------- |
| Remove 3 columns from `accounts`             | Breaking | Credentials moved to env vars   | Table recreation (Drizzle handles)  |
| Add `instruments` table                      | Feature  | Market reference data cache     | Simple CREATE TABLE                 |
| Add `account_snapshots` table                | Feature  | Equity curve tracking           | Simple CREATE TABLE                 |
| Add `candles` table                          | Feature  | OHLCV data cache                | Simple CREATE TABLE                 |
| Convert `bot_state` KV to `risk_state` typed | Refactor | Type-safe circuit breaker state | New table + optional data migration |

---

## Drizzle Kit Command Reference

```bash
# Generate migrations (recommended)
npm run db:generate
npm run db:generate -- --name="custom_name"

# Apply migrations
npm run db:migrate

# Push schema directly (dev only, not reversible)
npm run db:push

# Open Drizzle Studio (visual DB inspector)
npm run db:studio

# Introspect existing database
npm run db:introspect
```

---

## Resources

**Drizzle ORM Official:**

- Docs: https://orm.drizzle.team
- SQLite Column Types: https://orm.drizzle.team/docs/column-types/sqlite
- Indexes & Constraints: https://orm.drizzle.team/docs/indexes-constraints
- Migrations: https://orm.drizzle.team/docs/migrations

**Trading Platform Standards:**

- IG Markets API Reference
- Standard market data schemas (OHLCV)
- Risk management literature (position sizing, drawdown)

---

**Document Version:** 1.0  
**Date:** April 1, 2026  
**Status:** Research Complete — Ready for Implementation
