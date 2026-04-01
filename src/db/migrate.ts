/**
 * Database Migration Script
 *
 * Run with: pnpm run db:migrate (or pnpm tsx src/db/migrate.ts)
 *
 * This script applies all pending Drizzle migrations to the PostgreSQL database.
 * It can also be imported and called programmatically at bot startup.
 */

import { migrate } from "drizzle-orm/node-postgres/migrator";
import { createDatabase } from "./connection.js";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://igmarkets:igmarkets@localhost:5432/igmarkets";

/**
 * Run all pending migrations against the database.
 *
 * @param databaseUrl - PostgreSQL connection URL (default: DATABASE_URL env or localhost)
 */
export async function runMigrations(databaseUrl = DATABASE_URL): Promise<void> {
  const db = createDatabase(databaseUrl);
  await migrate(db, { migrationsFolder: "./drizzle" });
}

// Run directly when executed as a script
const isMainModule =
  typeof process !== "undefined" && process.argv[1]?.includes("migrate");

if (isMainModule) {
  console.log(`Running migrations against: ${DATABASE_URL}`);
  runMigrations()
    .then(() => {
      console.log("Migrations complete.");
      process.exit(0);
    })
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
