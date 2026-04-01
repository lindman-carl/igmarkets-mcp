/**
 * Database Module - Barrel Export
 *
 * Re-exports everything from the database layer:
 * - Connection management (createDatabase, getDatabase, closeDatabase)
 * - Schema tables (all 10 PostgreSQL tables)
 * - Migration runner (runMigrations)
 */

export { createDatabase, getDatabase, closeDatabase } from "./connection.js";
export type { BotDatabase } from "./connection.js";
export {
  strategies,
  accounts,
  instruments,
  accountSnapshots,
  candles,
  ticks,
  signals,
  trades,
  positions,
  riskState,
} from "./schema.js";
export { runMigrations } from "./migrate.js";
