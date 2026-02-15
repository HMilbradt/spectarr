// ─── TheTVDB API v4 Integration ──────────────────────────
//
// TVDB is used as a supplemental source to obtain TVDB IDs
// for items already matched via TMDB. The TVDB API requires
// authentication via a bearer token obtained from /login.
//
// API docs: https://thetvdb.github.io/v4-api/

import { log } from '@/lib/logger';

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

// ─── Search ──────────────────────────────────────────────

interface TVDBSearchResult {
  tvdb_id: string;
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
      results: results.map(r => ({ name: r.name, tvdbId: r.tvdb_id, year: r.year ?? null })),
    });

    if (results.length === 0) {
      log.debug(MODULE, 'No TVDB series results found', { query: title });
      return null;
    }

    // Try exact match first (case-insensitive)
    const normalizedTitle = title.toLowerCase().trim();
    const exactMatch = results.find(
      r => r.name?.toLowerCase().trim() === normalizedTitle
    );
    if (exactMatch) {
      const tvdbId = parseInt(exactMatch.tvdb_id, 10) || null;
      log.debug(MODULE, 'TVDB series exact match found', {
        query: title,
        matchedName: exactMatch.name,
        tvdbId,
      });
      return tvdbId;
    }

    // Fall back to first result
    const tvdbId = parseInt(results[0].tvdb_id, 10) || null;
    log.debug(MODULE, 'TVDB series using first result (no exact match)', {
      query: title,
      firstName: results[0].name,
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
      results: results.map(r => ({ name: r.name, tvdbId: r.tvdb_id, year: r.year ?? null })),
    });

    if (results.length === 0) {
      log.debug(MODULE, 'No TVDB movie results found', { query: title });
      return null;
    }

    const normalizedTitle = title.toLowerCase().trim();
    const exactMatch = results.find(
      r => r.name?.toLowerCase().trim() === normalizedTitle
    );
    if (exactMatch) {
      const tvdbId = parseInt(exactMatch.tvdb_id, 10) || null;
      log.debug(MODULE, 'TVDB movie exact match found', {
        query: title,
        matchedName: exactMatch.name,
        tvdbId,
      });
      return tvdbId;
    }

    const tvdbId = parseInt(results[0].tvdb_id, 10) || null;
    log.debug(MODULE, 'TVDB movie using first result (no exact match)', {
      query: title,
      firstName: results[0].name,
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
 * Look up a TVDB ID using an IMDB ID via the search/remoteid endpoint.
 * This is the most reliable way to cross-reference.
 */
export async function findTVDBByImdbId(
  imdbId: string,
): Promise<{ tvdbId: number; type: 'series' | 'movie' } | null> {
  try {
    const token = await getToken();

    log.debug(MODULE, 'Looking up TVDB by IMDB ID', { imdbId });

    const response = await fetch(
      `${TVDB_BASE_URL}/search/remoteid/${imdbId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      log.warn(MODULE, 'TVDB remote ID lookup failed', { imdbId, status: response.status });
      return null;
    }
    const data = await response.json();
    const results = data?.data ?? [];

    log.debug(MODULE, 'TVDB remote ID results', { imdbId, resultCount: results.length });

    if (results.length === 0) {
      log.debug(MODULE, 'No TVDB results for IMDB ID', { imdbId });
      return null;
    }

    // The remote ID search returns objects with nested series/movie records
    for (const result of results) {
      if (result.series) {
        log.debug(MODULE, 'TVDB resolved IMDB ID to series', {
          imdbId,
          tvdbId: result.series.id,
        });
        return { tvdbId: result.series.id, type: 'series' };
      }
      if (result.movie) {
        log.debug(MODULE, 'TVDB resolved IMDB ID to movie', {
          imdbId,
          tvdbId: result.movie.id,
        });
        return { tvdbId: result.movie.id, type: 'movie' };
      }
    }

    log.debug(MODULE, 'TVDB remote ID results had no series/movie records', { imdbId });
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
  log.debug(MODULE, 'Trying title search (strategy 2)', { title, type, year });

  if (type === 'tv') {
    const tvdbId = await searchTVDBSeries(title, year);
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
