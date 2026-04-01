/**
 * Database Module - Barrel Export
 *
 * Re-exports everything from the database layer:
 * - Connection management (createDatabase, getDatabase, closeDatabase)
 * - Schema tables (ticks, signals, trades, positions, botState)
 * - Migration runner (runMigrations)
 */

export { createDatabase, getDatabase, closeDatabase } from "./connection.js";
export type { BotDatabase } from "./connection.js";
export { ticks, signals, trades, positions, botState } from "./schema.js";
export { runMigrations } from "./migrate.js";
