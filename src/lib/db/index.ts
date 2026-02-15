import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'spectarr.db');

let _db: ReturnType<typeof createDb> | null = null;

function createDb() {
  // Ensure the data directory exists
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const sqlite = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL');
  // Enable foreign keys
  sqlite.pragma('foreign_keys = ON');

  return drizzle(sqlite, { schema });
}

/**
 * Get the Drizzle database instance (singleton).
 *
 * This is the adapter boundary — to swap to Postgres or MySQL,
 * replace this file with the appropriate driver and connection setup.
 * All queries use Drizzle's query builder, so business logic stays unchanged.
 */
export function getDb() {
  if (!_db) {
    _db = createDb();
  }
  return _db;
}

export type AppDatabase = ReturnType<typeof getDb>;
