// ─── TheTVDB API v4 Integration ──────────────────────────
//
// TVDB is used as a supplemental source to obtain TVDB IDs
// for items already matched via TMDB. The TVDB API requires
// authentication via a bearer token obtained from /login.
//
// API docs: https://thetvdb.github.io/v4-api/

import { log } from '@/lib/logger';
import { extractSeriesName } from '@/lib/metadata';

const TVDB_BASE_URL = 'https://api4.thetvdb.com/v4';
const MODULE = 'tvdb';

// ─── Configuration ───────────────────────────────────────

function getApiKey(): string {
  const key = process.env.TVDB_API_KEY;
  if (!key) {
    throw new Error('TVDB_API_KEY environment variable is not configured');
  }
  return key;
}

export function isTVDBConfigured(): boolean {
  return !!process.env.TVDB_API_KEY;
}

// ─── Token Cache ─────────────────────────────────────────

let cachedToken: string | null = null;
let tokenExpiresAt = 0; // Unix timestamp in ms
// Tokens are valid for 1 month; we refresh at 27 days to be safe
const TOKEN_LIFETIME_MS = 27 * 24 * 60 * 60 * 1000;

async function getToken(): Promise<string> {
  const apiKey = getApiKey();
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt) {
    log.debug(MODULE, 'Using cached TVDB token', {
      expiresIn: Math.round((tokenExpiresAt - now) / 1000 / 60 / 60) + ' hours',
    });
    return cachedToken;
  }

  log.info(MODULE, 'Requesting new TVDB auth token');

  const response = await fetch(`${TVDB_BASE_URL}/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ apikey: apiKey }),
  });

  if (!response.ok) {
    log.error(MODULE, 'TVDB login failed', { status: response.status, statusText: response.statusText });
    throw new Error(`TVDB login failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const token = data?.data?.token;
  if (!token) {
    log.error(MODULE, 'TVDB login returned no token');
    throw new Error('TVDB login returned no token');
  }

  cachedToken = token;
  tokenExpiresAt = now + TOKEN_LIFETIME_MS;
  log.info(MODULE, 'TVDB auth token obtained successfully');
  return token;
}

// ─── Title Similarity ────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

function normalizedSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 1;
  const maxLen = Math.max(a.length, b.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(a, b) / maxLen;
}

function stripArticle(s: string): string {
  return s.replace(/^(the|a|an)\s+/i, '').trim();
}

// ─── Search ──────────────────────────────────────────────

// The TVDB v4 SearchResult schema includes both `tvdb_id` and `id` fields.
// `tvdb_id` is the pure numeric string ID. `id` may be prefixed (e.g. "series-12345").
// We try `tvdb_id` first, then extract the numeric portion from `id` as a fallback.
interface TVDBSearchResult {
  tvdb_id?: string;
  id?: string;               // May be "series-12345" or just "12345"
  objectID?: string;          // Another ID field sometimes present
  name: string;
  type: string;              // "series", "movie", "person", "company"
  year?: string;
  slug?: string;
  overview?: string;
  image_url?: string;
  primary_type?: string;
  remote_ids?: Array<{ id: string; type: number; sourceName: string }>;
}

/**
 * Extract a numeric TVDB ID from a search result.
 * Tries `tvdb_id` first (pure numeric), then falls back to parsing `id`
 * (which may be prefixed like "series-12345"), then `objectID`.
 */
function extractTVDBId(result: TVDBSearchResult): number | null {
  // Try tvdb_id first (should be a pure numeric string)
  if (result.tvdb_id) {
    const parsed = parseInt(result.tvdb_id, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // Try id field - may be "series-12345" or just "12345"
  if (result.id) {
    // If it contains a dash, extract the numeric part after the last dash
    const dashIdx = result.id.lastIndexOf('-');
    const numericPart = dashIdx >= 0 ? result.id.slice(dashIdx + 1) : result.id;
    const parsed = parseInt(numericPart, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  // Try objectID as last resort
  if (result.objectID) {
    const dashIdx = result.objectID.lastIndexOf('-');
    const numericPart = dashIdx >= 0 ? result.objectID.slice(dashIdx + 1) : result.objectID;
    const parsed = parseInt(numericPart, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }

  return null;
}

/**
 * Score a TVDB search result against the query title and year.
 * Uses Levenshtein-based similarity with year bonus.
 * Also tries with season suffixes stripped for better TV show matching.
 */
function scoreTVDBResult(
  queryTitle: string,
  queryYear: number | null,
  result: TVDBSearchResult,
): number {
  const q = stripArticle(queryTitle.toLowerCase().trim());
  const r = stripArticle((result.name ?? '').toLowerCase().trim());
  let score = normalizedSimilarity(q, r);

  // Also try with season suffixes stripped
  const qStripped = stripArticle(extractSeriesName(queryTitle).toLowerCase().trim());
  if (qStripped !== q) {
    const strippedScore = normalizedSimilarity(qStripped, r);
    score = Math.max(score, strippedScore);
  }

  // Year match bonus
  if (queryYear && result.year) {
    const resultYear = parseInt(result.year, 10);
    if (resultYear === queryYear) {
      score = Math.min(score + 0.1, 1);
    }
  }

  return score;
}

/**
 * Pick the best result from a TVDB search response using title similarity scoring.
 * Returns the best match only if it meets a minimum similarity threshold.
 */
function pickBestResult(
  title: string,
  year: number | null,
  results: TVDBSearchResult[],
): TVDBSearchResult | null {
  if (results.length === 0) return null;

  let bestResult: TVDBSearchResult | null = null;
  let bestScore = 0;

  for (const result of results) {
    const score = scoreTVDBResult(title, year, result);
    log.debug(MODULE, 'TVDB candidate scored', {
      queryTitle: title,
      candidateName: result.name,
      candidateYear: result.year ?? null,
      score: Math.round(score * 1000) / 1000,
      tvdbId: extractTVDBId(result),
    });
    if (score > bestScore) {
      bestScore = score;
      bestResult = result;
    }
  }

  // Require a minimum similarity threshold (0.5) to avoid completely wrong matches
  if (bestScore < 0.5) {
    log.debug(MODULE, 'TVDB best result below similarity threshold', {
      queryTitle: title,
      bestName: bestResult?.name ?? null,
      bestScore: Math.round(bestScore * 1000) / 1000,
      threshold: 0.5,
    });
    return null;
  }

  return bestResult;
}

/**
 * Search TVDB for a series by name and optional year.
 * Returns the TVDB numeric ID if found, or null.
 */
export async function searchTVDBSeries(
  title: string,
  year: number | null,
): Promise<number | null> {
  try {
    const token = await getToken();
    const params = new URLSearchParams({
      query: title,
      type: 'series',
      limit: '5',
    });
    if (year) {
      params.set('year', String(year));
    }

    log.debug(MODULE, 'Searching TVDB for series', { query: title, year });

    const response = await fetch(`${TVDB_BASE_URL}/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      log.warn(MODULE, 'TVDB series search failed', { query: title, status: response.status });
      return null;
    }
    const data = await response.json();
    const results: TVDBSearchResult[] = data?.data ?? [];

    log.debug(MODULE, 'TVDB series search results', {
      query: title,
      resultCount: results.length,
      results: results.map(r => ({ name: r.name, tvdbId: extractTVDBId(r), year: r.year ?? null })),
    });

    if (results.length === 0) {
      log.debug(MODULE, 'No TVDB series results found', { query: title });
      return null;
    }

    const best = pickBestResult(title, year, results);
    if (!best) {
      log.debug(MODULE, 'No acceptable TVDB series match', { query: title });
      return null;
    }

    const tvdbId = extractTVDBId(best);
    log.debug(MODULE, 'TVDB series best match', {
      query: title,
      matchedName: best.name,
      tvdbId,
    });
    return tvdbId;
  } catch (err) {
    log.error(MODULE, 'TVDB series search exception', {
      query: title,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Search TVDB for a movie by name and optional year.
 * Returns the TVDB numeric ID if found, or null.
 */
export async function searchTVDBMovie(
  title: string,
  year: number | null,
): Promise<number | null> {
  try {
    const token = await getToken();
    const params = new URLSearchParams({
      query: title,
      type: 'movie',
      limit: '5',
    });
    if (year) {
      params.set('year', String(year));
    }

    log.debug(MODULE, 'Searching TVDB for movie', { query: title, year });

    const response = await fetch(`${TVDB_BASE_URL}/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      log.warn(MODULE, 'TVDB movie search failed', { query: title, status: response.status });
      return null;
    }
    const data = await response.json();
    const results: TVDBSearchResult[] = data?.data ?? [];

    log.debug(MODULE, 'TVDB movie search results', {
      query: title,
      resultCount: results.length,
      results: results.map(r => ({ name: r.name, tvdbId: extractTVDBId(r), year: r.year ?? null })),
    });

    if (results.length === 0) {
      log.debug(MODULE, 'No TVDB movie results found', { query: title });
      return null;
    }

    const best = pickBestResult(title, year, results);
    if (!best) {
      log.debug(MODULE, 'No acceptable TVDB movie match', { query: title });
      return null;
    }

    const tvdbId = extractTVDBId(best);
    log.debug(MODULE, 'TVDB movie best match', {
      query: title,
      matchedName: best.name,
      tvdbId,
    });
    return tvdbId;
  } catch (err) {
    log.error(MODULE, 'TVDB movie search exception', {
      query: title,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Look up a TVDB ID using an IMDB ID.
 *
 * Uses two strategies:
 *   1. The /search endpoint with `remote_id` query parameter (returns standard SearchResult).
 *   2. Fallback to /search/remoteid/{imdbId} path endpoint (returns SearchByRemoteIdResult
 *      with nested series/movie base records).
 *
 * This dual approach is needed because the TVDB v4 API has inconsistencies between the two
 * endpoints and some entries are only findable through one or the other.
 */
export async function findTVDBByImdbId(
  imdbId: string,
): Promise<{ tvdbId: number; type: 'series' | 'movie' } | null> {
  try {
    const token = await getToken();

    log.debug(MODULE, 'Looking up TVDB by IMDB ID', { imdbId });

    // Strategy 1: Use /search with remote_id query parameter
    // This returns standard SearchResult objects which are more predictable
    const searchParams = new URLSearchParams({
      remote_id: imdbId,
      limit: '5',
    });
    const searchResponse = await fetch(
      `${TVDB_BASE_URL}/search?${searchParams.toString()}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (searchResponse.ok) {
      const searchData = await searchResponse.json();
      const searchResults: TVDBSearchResult[] = searchData?.data ?? [];

      log.debug(MODULE, 'TVDB remote_id search results', {
        imdbId,
        resultCount: searchResults.length,
        results: searchResults.map(r => ({
          name: r.name,
          type: r.type,
          tvdbId: extractTVDBId(r),
        })),
      });

      if (searchResults.length > 0) {
        // Find the first result that is a series or movie
        for (const result of searchResults) {
          const resultType = (result.type ?? result.primary_type ?? '').toLowerCase();
          const tvdbId = extractTVDBId(result);
          if (tvdbId && (resultType === 'series' || resultType === 'movie')) {
            const type = resultType === 'series' ? 'series' : 'movie';
            log.info(MODULE, 'TVDB resolved IMDB ID via search remote_id', {
              imdbId,
              tvdbId,
              type,
              name: result.name,
            });
            return { tvdbId, type };
          }
        }
        // If no series/movie type matched, use the first result with a valid ID
        const first = searchResults[0];
        const tvdbId = extractTVDBId(first);
        if (tvdbId) {
          const resultType = (first.type ?? first.primary_type ?? '').toLowerCase();
          const type: 'series' | 'movie' = resultType === 'movie' ? 'movie' : 'series';
          log.info(MODULE, 'TVDB resolved IMDB ID via search remote_id (first result)', {
            imdbId,
            tvdbId,
            type,
            name: first.name,
          });
          return { tvdbId, type };
        }
      }
    } else {
      log.debug(MODULE, 'TVDB /search with remote_id failed, trying path endpoint', {
        imdbId,
        status: searchResponse.status,
      });
    }

    // Strategy 2: Fallback to /search/remoteid/{imdbId} path endpoint
    // This returns SearchByRemoteIdResult with nested series/movie base records
    log.debug(MODULE, 'Trying /search/remoteid path endpoint', { imdbId });

    const remoteIdResponse = await fetch(
      `${TVDB_BASE_URL}/search/remoteid/${imdbId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!remoteIdResponse.ok) {
      log.warn(MODULE, 'TVDB remote ID path lookup also failed', { imdbId, status: remoteIdResponse.status });
      return null;
    }

    const remoteIdData = await remoteIdResponse.json();
    const remoteIdResults = remoteIdData?.data ?? [];

    log.debug(MODULE, 'TVDB remoteid path results', { imdbId, resultCount: remoteIdResults.length });

    if (remoteIdResults.length === 0) {
      log.debug(MODULE, 'No TVDB results for IMDB ID from either endpoint', { imdbId });
      return null;
    }

    // The remote ID path endpoint returns objects with nested series/movie records
    for (const result of remoteIdResults) {
      if (result.series) {
        const seriesId = typeof result.series.id === 'number'
          ? result.series.id
          : parseInt(String(result.series.id), 10);
        if (!isNaN(seriesId) && seriesId > 0) {
          log.debug(MODULE, 'TVDB resolved IMDB ID to series via path endpoint', {
            imdbId,
            tvdbId: seriesId,
          });
          return { tvdbId: seriesId, type: 'series' };
        }
      }
      if (result.movie) {
        const movieId = typeof result.movie.id === 'number'
          ? result.movie.id
          : parseInt(String(result.movie.id), 10);
        if (!isNaN(movieId) && movieId > 0) {
          log.debug(MODULE, 'TVDB resolved IMDB ID to movie via path endpoint', {
            imdbId,
            tvdbId: movieId,
          });
          return { tvdbId: movieId, type: 'movie' };
        }
      }
    }

    log.debug(MODULE, 'TVDB remote ID results had no valid series/movie records', { imdbId });
    return null;
  } catch (err) {
    log.error(MODULE, 'TVDB remote ID lookup exception', {
      imdbId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Resolve a TVDB ID for an item that was already matched via TMDB.
 * Strategy:
 *   1. If we have an IMDB ID, use the remote ID lookup (most reliable).
 *   2. Otherwise, fall back to title search.
 */
export async function resolveTVDBId(
  title: string,
  year: number | null,
  imdbId: string | null,
  type: 'movie' | 'tv' | string,
): Promise<number | null> {
  if (!isTVDBConfigured()) {
    log.debug(MODULE, 'TVDB not configured, skipping resolution');
    return null;
  }

  log.info(MODULE, 'Resolving TVDB ID', { title, year, imdbId, type });

  // Strategy 1: IMDB ID lookup (most reliable cross-reference)
  if (imdbId) {
    log.debug(MODULE, 'Trying IMDB ID cross-reference (strategy 1)', { title, imdbId });
    const result = await findTVDBByImdbId(imdbId);
    if (result) {
      log.info(MODULE, 'TVDB ID resolved via IMDB ID', {
        title,
        imdbId,
        tvdbId: result.tvdbId,
        tvdbType: result.type,
      });
      return result.tvdbId;
    }
    log.debug(MODULE, 'IMDB ID cross-reference returned no result, falling back to title search', {
      title,
      imdbId,
    });
  }

  // Strategy 2: Title search as fallback
  // For TV shows, use the cleaned series name (without season suffixes)
  const searchTitle = type === 'tv' ? extractSeriesName(title) : title;
  log.debug(MODULE, 'Trying title search (strategy 2)', { title, searchTitle, type, year });

  if (type === 'tv') {
    let tvdbId = await searchTVDBSeries(searchTitle, year);
    // If cleaned title failed, try original title
    if (!tvdbId && searchTitle !== title) {
      tvdbId = await searchTVDBSeries(title, year);
    }
    if (tvdbId) {
      log.info(MODULE, 'TVDB ID resolved via series title search', { title, tvdbId });
    } else {
      log.debug(MODULE, 'TVDB series title search returned no result', { title });
    }
    return tvdbId;
  } else if (type === 'movie') {
    const tvdbId = await searchTVDBMovie(title, year);
    if (tvdbId) {
      log.info(MODULE, 'TVDB ID resolved via movie title search', { title, tvdbId });
    } else {
      log.debug(MODULE, 'TVDB movie title search returned no result', { title });
    }
    return tvdbId;
  }

  // For 'dvd' or other types, try movie then series
  log.debug(MODULE, 'Trying movie then series search for non-standard type', { title, type });
  const movieId = await searchTVDBMovie(title, year);
  if (movieId) {
    log.info(MODULE, 'TVDB ID resolved via movie search (fallback for type)', { title, type, tvdbId: movieId });
    return movieId;
  }
  const seriesId = await searchTVDBSeries(title, year);
  if (seriesId) {
    log.info(MODULE, 'TVDB ID resolved via series search (fallback for type)', { title, type, tvdbId: seriesId });
  } else {
    log.debug(MODULE, 'TVDB ID could not be resolved', { title, type });
  }
  return seriesId;
}

/**
 * Test TVDB connectivity by attempting to log in and obtain a token.
 */
export async function testTVDBConnection(): Promise<{ ok: boolean; message: string }> {
  try {
    const token = await getToken();
    return { ok: !!token, message: 'Successfully authenticated with TVDB' };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}
