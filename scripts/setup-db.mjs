/**
 * Database setup script — creates tables and indexes if they don't exist.
 * Run before the Next.js server starts (e.g. via the "predev" / "prestart" npm scripts).
 *
 * Uses better-sqlite3 directly so it can run as plain JS without a TS compiler.
 */

import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DATABASE_PATH || path.join(process.cwd(), 'data', 'spectarr.db');

// Ensure the data directory exists
const dir = path.dirname(DB_PATH);
if (!fs.existsSync(dir)) {
  fs.mkdirSync(dir, { recursive: true });
}

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log(`[setup-db] Migrating database at ${DB_PATH}`);

db.exec(`
  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    hash TEXT NOT NULL UNIQUE,
    data BLOB NOT NULL,
    mime_type TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL REFERENCES images(id) ON DELETE CASCADE,
    model_id TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    raw_response TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS scan_items (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    creator TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'other',
    confidence TEXT NOT NULL DEFAULT 'unmatched',
    source TEXT NOT NULL DEFAULT 'none',
    tmdb_id INTEGER,
    imdb_id TEXT,
    tvdb_id INTEGER,
    poster_url TEXT,
    overview TEXT,
    rating REAL,
    release_date TEXT,
    genres TEXT,
    year INTEGER,
    director TEXT,
    runtime INTEGER,
    network TEXT,
    seasons INTEGER,
    show_status TEXT,
    plex_match INTEGER NOT NULL DEFAULT 0,
    plex_rating_key TEXT,
    raw_title TEXT NOT NULL,
    raw_creator TEXT NOT NULL DEFAULT '',
    raw_type TEXT NOT NULL,
    raw_year INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS usage_records (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    input_tokens INTEGER NOT NULL,
    output_tokens INTEGER NOT NULL,
    cost_usd REAL NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at INTEGER NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_scans_image_id ON scans(image_id);
  CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at);
  CREATE INDEX IF NOT EXISTS idx_scan_items_scan_id ON scan_items(scan_id);
  CREATE INDEX IF NOT EXISTS idx_usage_records_scan_id ON usage_records(scan_id);
`);

db.close();

console.log('[setup-db] Database setup complete');
