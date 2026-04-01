/**
 * Database Migration Script
 *
 * Run with: npm run db:migrate (or npx tsx src/db/migrate.ts)
 *
 * This script applies all pending Drizzle migrations to the SQLite database.
 * It can also be imported and called programmatically at bot startup.
 */

import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { createDatabase } from "./connection.js";

const DB_PATH = process.env.BOT_DB_PATH ?? "bot.db";

/**
 * Run all pending migrations against the database.
 *
 * @param dbPath - Path to the SQLite database file (default: BOT_DB_PATH env or "bot.db")
 */
export function runMigrations(dbPath = DB_PATH): void {
  const db = createDatabase(dbPath);
  migrate(db, { migrationsFolder: "./drizzle" });
}

// Run directly when executed as a script
const isMainModule =
  typeof process !== "undefined" && process.argv[1]?.includes("migrate");

if (isMainModule) {
  console.log(`Running migrations against: ${DB_PATH}`);
  runMigrations();
  console.log("Migrations complete.");
}
