import { sqliteTable, text, integer, real, blob } from 'drizzle-orm/sqlite-core';

// ─── Images ──────────────────────────────────────────────

export const images = sqliteTable('images', {
  id: text('id').primaryKey(),
  hash: text('hash').notNull().unique(),
  data: blob('data', { mode: 'buffer' }).notNull(),
  mimeType: text('mime_type').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
});

// ─── Scans ───────────────────────────────────────────────

export const scans = sqliteTable('scans', {
  id: text('id').primaryKey(),
  imageId: text('image_id')
    .notNull()
    .references(() => images.id, { onDelete: 'cascade' }),
  modelId: text('model_id').notNull(),
  status: text('status').notNull().default('pending'),
  /** Full raw LLM JSON response — preserved for re-enrichment */
  rawResponse: text('raw_response'),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
});

// ─── Scan Items ──────────────────────────────────────────

export const scanItems = sqliteTable('scan_items', {
  id: text('id').primaryKey(),
  scanId: text('scan_id')
    .notNull()
    .references(() => scans.id, { onDelete: 'cascade' }),

  // Enriched fields (may differ from raw LLM output after metadata lookup)
  title: text('title').notNull(),
  creator: text('creator').notNull().default(''),
  type: text('type').notNull().default('other'),
  confidence: text('confidence').notNull().default('unmatched'),
  source: text('source').notNull().default('none'),

  // TMDB metadata
  tmdbId: integer('tmdb_id'),
  imdbId: text('imdb_id'),
  tvdbId: integer('tvdb_id'),
  posterUrl: text('poster_url'),
  overview: text('overview'),
  rating: real('rating'),
  releaseDate: text('release_date'),
  genres: text('genres'),
  year: integer('year'),

  // Movie-specific
  director: text('director'),
  runtime: integer('runtime'),

  // TV-specific
  network: text('network'),
  seasons: integer('seasons'),
  showStatus: text('show_status'),

  // Plex integration
  plexMatch: integer('plex_match', { mode: 'boolean' }).notNull().default(false),
  plexRatingKey: text('plex_rating_key'),

  // Raw LLM output (preserved for re-enrichment without re-scanning)
  rawTitle: text('raw_title').notNull(),
  rawCreator: text('raw_creator').notNull().default(''),
  rawType: text('raw_type').notNull(),
  rawYear: integer('raw_year'),

  createdAt: integer('created_at', { mode: 'number' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
});

// ─── Usage Records ───────────────────────────────────────

export const usageRecords = sqliteTable('usage_records', {
  id: text('id').primaryKey(),
  scanId: text('scan_id')
    .notNull()
    .references(() => scans.id, { onDelete: 'cascade' }),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  costUsd: real('cost_usd').notNull(),
  createdAt: integer('created_at', { mode: 'number' }).notNull(),
});

// ─── Settings ────────────────────────────────────────────

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'number' }).notNull(),
});
