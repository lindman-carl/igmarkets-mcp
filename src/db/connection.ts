/**
 * Database Connection - SQLite via Drizzle ORM
 *
 * Provides a singleton database connection for the trading bot.
 * Uses better-sqlite3 for synchronous SQLite access.
 */

import { drizzle } from "drizzle-orm/better-sqlite3";
import Database from "better-sqlite3";
import * as schema from "./schema.js";

export type BotDatabase = ReturnType<typeof createDatabase>;

let db: BotDatabase | null = null;

/**
 * Create a new Drizzle database instance backed by SQLite.
 *
 * @param dbPath - Path to the SQLite database file (default: "bot.db")
 */
export function createDatabase(dbPath = "bot.db"): ReturnType<typeof drizzle> {
  const sqlite = new Database(dbPath);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma("journal_mode = WAL");

  return drizzle({ client: sqlite, schema });
}

/**
 * Get or create the singleton database instance.
 *
 * @param dbPath - Path to the SQLite database file
 */
export function getDatabase(dbPath?: string): BotDatabase {
  if (!db) {
    db = createDatabase(dbPath);
  }
  return db;
}

/**
 * Close the singleton database connection.
 */
export function closeDatabase(): void {
  db = null;
}
