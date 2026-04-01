/**
 * Database Connection - PostgreSQL via Drizzle ORM
 *
 * Provides a singleton database connection for the trading bot.
 * Uses node-postgres (pg) Pool for async PostgreSQL access.
 */

import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";

const { Pool } = pg;

const DEFAULT_DATABASE_URL =
  "postgresql://igmarkets:igmarkets@localhost:5432/igmarkets";

export type BotDatabase = ReturnType<typeof createDatabase>;

let db: BotDatabase | null = null;
let pool: pg.Pool | null = null;

/**
 * Create a new Drizzle database instance backed by PostgreSQL.
 *
 * @param databaseUrl - PostgreSQL connection URL (default: DATABASE_URL env or localhost)
 */
export function createDatabase(
  databaseUrl?: string,
): ReturnType<typeof drizzle> {
  const url = databaseUrl ?? process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL;
  const newPool = new Pool({ connectionString: url });
  pool = newPool;
  return drizzle({ client: newPool, schema });
}

/**
 * Get or create the singleton database instance.
 *
 * @param databaseUrl - PostgreSQL connection URL
 */
export function getDatabase(databaseUrl?: string): BotDatabase {
  if (!db) {
    db = createDatabase(databaseUrl);
  }
  return db;
}

/**
 * Close the singleton database connection and drain the pool.
 */
export async function closeDatabase(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
  db = null;
}
