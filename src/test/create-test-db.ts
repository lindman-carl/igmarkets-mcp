/**
 * Shared test helper — creates an in-memory PGlite database with all tables.
 *
 * Uses @electric-sql/pglite for a zero-dependency, in-process PostgreSQL
 * instance and drizzle-orm/pglite as the Drizzle adapter.
 *
 * Each call returns a fresh isolated database.
 */

import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../db/schema.js";
import type { BotDatabase } from "../db/connection.js";

/**
 * DDL that mirrors src/db/schema.ts (PostgreSQL pgTable definitions).
 * Kept in sync manually — if you change schema.ts, update this DDL.
 */
const DDL = `
-- strategies
CREATE TABLE IF NOT EXISTS strategies (
  id              SERIAL PRIMARY KEY,
  name            TEXT NOT NULL UNIQUE,
  prompt          TEXT NOT NULL,
  strategy_type   TEXT NOT NULL,
  strategy_params JSONB,
  risk_config     JSONB,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS strategies_is_active_idx ON strategies (is_active);

-- accounts (no credentials)
CREATE TABLE IF NOT EXISTS accounts (
  id               SERIAL PRIMARY KEY,
  name             TEXT NOT NULL UNIQUE,
  is_demo          BOOLEAN NOT NULL DEFAULT TRUE,
  strategy_id      INTEGER NOT NULL,
  interval_minutes INTEGER NOT NULL DEFAULT 15,
  timezone         TEXT NOT NULL DEFAULT 'Europe/London',
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS accounts_strategy_id_idx ON accounts (strategy_id);
CREATE INDEX IF NOT EXISTS accounts_is_active_idx ON accounts (is_active);

-- instruments
CREATE TABLE IF NOT EXISTS instruments (
  id              SERIAL PRIMARY KEY,
  epic            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  min_deal_size   DOUBLE PRECISION NOT NULL,
  tick_size       DOUBLE PRECISION,
  margin_factor   DOUBLE PRECISION,
  currency_code   TEXT NOT NULL,
  expiry          TEXT,
  trading_hours   JSONB,
  last_synced_at  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS instruments_currency_code_idx ON instruments (currency_code);

-- account_snapshots
CREATE TABLE IF NOT EXISTS account_snapshots (
  id              SERIAL PRIMARY KEY,
  account_id      INTEGER NOT NULL,
  balance         DOUBLE PRECISION NOT NULL,
  equity          DOUBLE PRECISION NOT NULL,
  margin          DOUBLE PRECISION NOT NULL DEFAULT 0,
  profit_loss     DOUBLE PRECISION NOT NULL DEFAULT 0,
  available_funds DOUBLE PRECISION NOT NULL DEFAULT 0,
  snapshot_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS account_snapshots_account_id_idx ON account_snapshots (account_id);
CREATE INDEX IF NOT EXISTS account_snapshots_snapshot_at_idx ON account_snapshots (snapshot_at);

-- candles
CREATE TABLE IF NOT EXISTS candles (
  id         SERIAL PRIMARY KEY,
  epic       TEXT NOT NULL,
  resolution TEXT NOT NULL,
  timestamp  TIMESTAMPTZ NOT NULL,
  open       DOUBLE PRECISION NOT NULL,
  high       DOUBLE PRECISION NOT NULL,
  low        DOUBLE PRECISION NOT NULL,
  close      DOUBLE PRECISION NOT NULL,
  volume     DOUBLE PRECISION,
  CONSTRAINT candles_epic_resolution_timestamp_uq UNIQUE (epic, resolution, timestamp)
);
CREATE INDEX IF NOT EXISTS candles_epic_resolution_idx ON candles (epic, resolution);
CREATE INDEX IF NOT EXISTS candles_timestamp_idx ON candles (timestamp);

-- ticks
CREATE TABLE IF NOT EXISTS ticks (
  id                  SERIAL PRIMARY KEY,
  account_id          INTEGER,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at        TIMESTAMPTZ,
  status              TEXT NOT NULL DEFAULT 'running',
  instruments_scanned INTEGER DEFAULT 0,
  signals_generated   INTEGER DEFAULT 0,
  trades_executed     INTEGER DEFAULT 0,
  error               TEXT,
  metadata            JSONB
);
CREATE INDEX IF NOT EXISTS ticks_started_at_idx ON ticks (started_at);
CREATE INDEX IF NOT EXISTS ticks_account_id_idx ON ticks (account_id);

-- signals
CREATE TABLE IF NOT EXISTS signals (
  id              SERIAL PRIMARY KEY,
  account_id      INTEGER,
  tick_id         INTEGER NOT NULL,
  epic            TEXT NOT NULL,
  strategy        TEXT NOT NULL,
  action          TEXT NOT NULL,
  signal_type     TEXT NOT NULL,
  confidence      DOUBLE PRECISION,
  price_at_signal DOUBLE PRECISION,
  suggested_stop  DOUBLE PRECISION,
  suggested_limit DOUBLE PRECISION,
  suggested_size  DOUBLE PRECISION,
  acted           BOOLEAN DEFAULT FALSE,
  skip_reason     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  indicator_data  JSONB
);
CREATE INDEX IF NOT EXISTS signals_tick_id_idx ON signals (tick_id);
CREATE INDEX IF NOT EXISTS signals_epic_idx ON signals (epic);
CREATE INDEX IF NOT EXISTS signals_created_at_idx ON signals (created_at);
CREATE INDEX IF NOT EXISTS signals_account_id_idx ON signals (account_id);

-- trades
CREATE TABLE IF NOT EXISTS trades (
  id                SERIAL PRIMARY KEY,
  account_id        INTEGER,
  tick_id           INTEGER NOT NULL,
  signal_id         INTEGER,
  deal_reference    TEXT,
  deal_id           TEXT,
  epic              TEXT NOT NULL,
  direction         TEXT NOT NULL,
  size              DOUBLE PRECISION NOT NULL,
  order_type        TEXT NOT NULL,
  execution_price   DOUBLE PRECISION,
  stop_level        DOUBLE PRECISION,
  limit_level       DOUBLE PRECISION,
  status            TEXT NOT NULL DEFAULT 'PENDING',
  reject_reason     TEXT,
  currency_code     TEXT NOT NULL,
  expiry            TEXT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmation_data JSONB
);
CREATE INDEX IF NOT EXISTS trades_tick_id_idx ON trades (tick_id);
CREATE INDEX IF NOT EXISTS trades_deal_id_idx ON trades (deal_id);
CREATE INDEX IF NOT EXISTS trades_epic_idx ON trades (epic);
CREATE INDEX IF NOT EXISTS trades_created_at_idx ON trades (created_at);
CREATE INDEX IF NOT EXISTS trades_account_id_idx ON trades (account_id);

-- positions
CREATE TABLE IF NOT EXISTS positions (
  id              SERIAL PRIMARY KEY,
  account_id      INTEGER,
  deal_id         TEXT NOT NULL UNIQUE,
  epic            TEXT NOT NULL,
  direction       TEXT NOT NULL,
  size            DOUBLE PRECISION NOT NULL,
  entry_price     DOUBLE PRECISION NOT NULL,
  current_stop    DOUBLE PRECISION,
  current_limit   DOUBLE PRECISION,
  strategy        TEXT,
  status          TEXT NOT NULL DEFAULT 'open',
  exit_price      DOUBLE PRECISION,
  realized_pnl    DOUBLE PRECISION,
  currency_code   TEXT NOT NULL,
  expiry          TEXT NOT NULL,
  opened_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at       TIMESTAMPTZ,
  open_trade_id   INTEGER,
  close_trade_id  INTEGER,
  metadata        JSONB
);
CREATE INDEX IF NOT EXISTS positions_epic_idx ON positions (epic);
CREATE INDEX IF NOT EXISTS positions_status_idx ON positions (status);
CREATE INDEX IF NOT EXISTS positions_account_id_idx ON positions (account_id);

-- risk_state
CREATE TABLE IF NOT EXISTS risk_state (
  id                   SERIAL PRIMARY KEY,
  account_id           INTEGER UNIQUE,
  tripped              BOOLEAN NOT NULL DEFAULT FALSE,
  consecutive_losses   INTEGER NOT NULL DEFAULT 0,
  consecutive_errors   INTEGER NOT NULL DEFAULT 0,
  last_tripped_at      TIMESTAMPTZ,
  cooldown_until       TIMESTAMPTZ,
  total_losses_today   DOUBLE PRECISION NOT NULL DEFAULT 0,
  daily_pnl            DOUBLE PRECISION NOT NULL DEFAULT 0,
  last_daily_reset_date TEXT,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS risk_state_account_id_idx ON risk_state (account_id);
`;

/**
 * Create a fresh in-memory PGlite database with all tables applied.
 * Each test gets its own isolated instance.
 *
 * Returns a Drizzle database instance typed as BotDatabase.
 */
export async function createTestDb(): Promise<BotDatabase> {
  const client = new PGlite();
  const db = drizzle({ client, schema });

  // Apply DDL
  await client.exec(DDL);

  return db as unknown as BotDatabase;
}
