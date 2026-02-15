// ─── Enums / Literals ────────────────────────────────────

export type ItemType = 'movie' | 'tv' | 'dvd' | 'vinyl' | 'game' | 'other';
export type Confidence = 'high' | 'low' | 'unmatched';
export type MetadataSource = 'tmdb' | 'plex' | 'none';
export type ScanStatus = 'pending' | 'analyzing' | 'enriching' | 'complete' | 'error';

// ─── Database Row Types (inferred from Drizzle schema) ──

/** These are re-exported for convenience. The Drizzle schema
 *  is the source of truth — see src/lib/db/schema.ts */

export interface ScanRow {
  id: string;
  imageId: string;
  modelId: string;
  status: string;
  rawResponse: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ScanItemRow {
  id: string;
  scanId: string;
  title: string;
  creator: string;
  type: string;
  confidence: string;
  source: string;
  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  posterUrl: string | null;
  overview: string | null;
  rating: number | null;
  releaseDate: string | null;
  genres: string | null;
  year: number | null;
  director: string | null;
  runtime: number | null;
  network: string | null;
  seasons: number | null;
  showStatus: string | null;
  plexMatch: boolean;
  plexRatingKey: string | null;
  rawTitle: string;
  rawCreator: string;
  rawType: string;
  rawYear: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface UsageRecordRow {
  id: string;
  scanId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  createdAt: number;
}

export interface SettingRow {
  key: string;
  value: string;
  updatedAt: number;
}

// ─── API Response Types ──────────────────────────────────

/** GET /api/scans — list response */
export interface ScanListItem {
  id: string;
  imageId: string;
  modelId: string;
  status: ScanStatus;
  createdAt: number;
  updatedAt: number;
  itemCount: number;
  totalCost: number;
}

/** GET /api/scans/[id] — detail response */
export interface ScanDetail {
  id: string;
  imageId: string;
  modelId: string;
  status: ScanStatus;
  createdAt: number;
  updatedAt: number;
  items: ScanItemRow[];
}

/** SSE events emitted during scan/rescan/re-enrich */
export type ScanStreamEvent =
  | { event: 'created'; data: { scanId: string } }
  | { event: 'status'; data: { status: ScanStatus } }
  | { event: 'complete'; data: { scan: ScanDetail } }
  | { event: 'error'; data: { message: string } };

// ─── LLM Types ───────────────────────────────────────────

/** Shape returned by the LLM vision call (pre-enrichment). */
export interface LLMIdentifiedItem {
  title: string;
  creator: string;
  type: ItemType;
  year?: number;
}

export interface LLMResponse {
  items: LLMIdentifiedItem[];
}

/** Token usage from OpenRouter response. */
export interface LLMUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
}

// ─── Enriched Item (from metadata pipeline) ──────────────

export interface EnrichedItem {
  title: string;
  creator: string;
  type: ItemType;
  confidence: Confidence;
  source: MetadataSource;

  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  posterUrl: string | null;
  overview: string | null;
  rating: number | null;
  releaseDate: string | null;
  genres: string | null;
  year: number | null;

  director: string | null;
  runtime: number | null;

  network: string | null;
  seasons: number | null;
  showStatus: string | null;

  plexMatch: boolean;
  plexRatingKey: string | null;
}

// ─── API Error ───────────────────────────────────────────

export interface ApiError {
  error: string;
  code: string;
}

// ─── Model Configuration ─────────────────────────────────

export interface ModelConfig {
  id: string;
  name: string;
  inputCostPerMTokens: number;
  outputCostPerMTokens: number;
}

// ─── Plex Types ──────────────────────────────────────────

export interface PlexLibrary {
  key: string;
  title: string;
  type: 'movie' | 'show' | 'artist' | 'photo';
}

export interface PlexGuid {
  imdbId?: string;
  tmdbId?: string;
  tvdbId?: string;
}

export interface PlexItem {
  ratingKey: string;
  title: string;
  year: number | null;
  guids: PlexGuid;
  type: 'movie' | 'show';
}
