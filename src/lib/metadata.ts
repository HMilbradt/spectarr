import type { LLMIdentifiedItem, EnrichedItem, Confidence, MetadataSource } from '@/types';
import { resolveTVDBId, isTVDBConfigured } from '@/lib/tvdb';
import { log } from '@/lib/logger';

// ─── Constants ───────────────────────────────────────────

const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p/w500';
const MODULE = 'metadata';

function getTmdbApiKey(): string {
  const key = process.env.TMDB_API_KEY;
  if (!key) {
    throw new Error('TMDB_API_KEY environment variable is not configured');
  }
  return key;
}

export function isTMDBConfigured(): boolean {
  return !!process.env.TMDB_API_KEY;
}

// ─── Levenshtein Distance ────────────────────────────────

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

/**
 * Strip season/series suffixes that the LLM commonly appends to TV show titles.
 * TMDB returns just the series name (e.g. "CSI: Crime Scene Investigation")
 * but the LLM often returns "CSI: Crime Scene Investigation - Season 1".
 *
 * This handles patterns like:
 *   - "Show - Season 1", "Show: Season 1", "Show Season 1"
 *   - "Show - S01", "Show S01"
 *   - "Show - The Complete First Season", "Show - Complete Season 3"
 *   - "Show - The Complete Series", "Show: Complete Series"
 *   - "Show - Series 1", "Show: Series 1"
 *   - "Show (Season 1)", "Show (2005) - Season 1"
 */
function stripSeasonSuffix(s: string): string {
  // Remove trailing parenthetical season info: "Show (Season 1)" -> "Show"
  let cleaned = s.replace(/\s*\((?:season|series|s)\s*\d+\)\s*$/i, '');

  // Remove "- Season 1", ": Season 1", "Season 1" at end (with optional ordinals like "First", "Second")
  cleaned = cleaned.replace(
    /\s*[-:]\s*(?:the\s+)?(?:complete\s+)?(?:season|series)\s+(?:\d+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s*$/i,
    ''
  );

  // Remove standalone "Season X" at end (no separator)
  cleaned = cleaned.replace(
    /\s+(?:the\s+)?(?:complete\s+)?(?:season|series)\s+(?:\d+|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\s*$/i,
    ''
  );

  // Remove "- S01", "S01" at end
  cleaned = cleaned.replace(/\s*[-:]\s*s\d+\s*$/i, '');

  // Remove "- The Complete Series", ": Complete Series"
  cleaned = cleaned.replace(/\s*[-:]\s*(?:the\s+)?complete\s+series\s*$/i, '');

  // Remove "- Complete Season", ": The Complete Nth Season"
  cleaned = cleaned.replace(
    /\s*[-:]\s*(?:the\s+)?complete\s+(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|\d+(?:st|nd|rd|th)?)\s+season\s*$/i,
    ''
  );

  return cleaned.trim();
}

/**
 * Extract the base series name from a title for TMDB search purposes.
 * Applies season stripping and also handles year suffixes in parentheses.
 */
export function extractSeriesName(title: string): string {
  let name = stripSeasonSuffix(title);
  // Remove trailing year in parentheses: "Show (2005)" -> "Show"
  name = name.replace(/\s*\(\d{4}\)\s*$/, '');
  return name.trim();
}

function computeTitleScore(queryTitle: string, resultTitle: string): number {
  const t1 = stripArticle(queryTitle.toLowerCase());
  const t2 = stripArticle(resultTitle.toLowerCase());
  const rawScore = normalizedSimilarity(t1, t2);

  // Also compute score with season suffixes stripped from the query,
  // since TMDB returns just the series name without season info
  const t1Stripped = stripArticle(stripSeasonSuffix(queryTitle).toLowerCase());
  const strippedScore = normalizedSimilarity(t1Stripped, t2);

  // Use the better of the two scores
  const score = Math.max(rawScore, strippedScore);

  log.debug(MODULE, 'Title score computed', {
    query: queryTitle,
    result: resultTitle,
    normalizedQuery: t1,
    normalizedResult: t2,
    rawScore: Math.round(rawScore * 1000) / 1000,
    strippedQuery: t1Stripped !== t1 ? t1Stripped : undefined,
    strippedScore: t1Stripped !== t1 ? Math.round(strippedScore * 1000) / 1000 : undefined,
    score: Math.round(score * 1000) / 1000,
  });
  return score;
}

function scoreToConfidence(score: number): Confidence {
  if (score >= 0.85) return 'high';
  if (score >= 0.50) return 'low';
  return 'unmatched';
}

// ─── TMDB Genre Cache ────────────────────────────────────

const genreCache: Map<number, string> = new Map();
let genreCacheLoaded = false;

async function loadGenreCache(apiKey: string): Promise<void> {
  if (genreCacheLoaded) return;

  log.debug(MODULE, 'Loading TMDB genre cache');

  try {
    const [movieRes, tvRes] = await Promise.all([
      fetch(`${TMDB_BASE_URL}/genre/movie/list?language=en-US`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
      fetch(`${TMDB_BASE_URL}/genre/tv/list?language=en-US`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    ]);

    if (movieRes.ok) {
      const data = await movieRes.json();
      for (const g of data.genres ?? []) {
        genreCache.set(g.id, g.name);
      }
    } else {
      log.warn(MODULE, 'Failed to load movie genre list', { status: movieRes.status });
    }
    if (tvRes.ok) {
      const data = await tvRes.json();
      for (const g of data.genres ?? []) {
        genreCache.set(g.id, g.name);
      }
    } else {
      log.warn(MODULE, 'Failed to load TV genre list', { status: tvRes.status });
    }
    genreCacheLoaded = true;
    log.debug(MODULE, 'Genre cache loaded', { genreCount: genreCache.size });
  } catch (err) {
    log.warn(MODULE, 'Genre cache load failed, proceeding without genres', {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

function resolveGenres(genreIds: number[]): string | null {
  if (!genreIds || genreIds.length === 0) return null;
  const names = genreIds
    .map(id => genreCache.get(id))
    .filter(Boolean);
  return names.length > 0 ? names.join(', ') : null;
}

// ─── TMDB Search: Movies ─────────────────────────────────

interface TMDBMovieResult {
  id: number;
  title: string;
  original_title: string;
  overview: string;
  release_date: string;
  poster_path: string | null;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
}

async function searchTMDBMovies(
  title: string,
  year: number | undefined,
  apiKey: string
): Promise<TMDBMovieResult[]> {
  try {
    const params = new URLSearchParams({
      query: title,
      language: 'en-US',
      page: '1',
    });
    if (year && year > 0) {
      params.set('year', String(year));
    }

    log.debug(MODULE, 'Searching TMDB movies', { query: title, year: year ?? null });

    const response = await fetch(
      `${TMDB_BASE_URL}/search/movie?${params.toString()}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!response.ok) {
      log.warn(MODULE, 'TMDB movie search failed', {
        query: title,
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }
    const data = await response.json();
    const results = data.results?.slice(0, 5) ?? [];

    log.debug(MODULE, 'TMDB movie search results', {
      query: title,
      totalResults: data.total_results ?? 0,
      returnedResults: results.length,
      titles: results.map((r: TMDBMovieResult) => `${r.title} (${r.release_date?.slice(0, 4) ?? '?'})`),
    });

    return results;
  } catch (err) {
    log.error(MODULE, 'TMDB movie search exception', {
      query: title,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─── TMDB Search: TV Shows ───────────────────────────────

interface TMDBTVResult {
  id: number;
  name: string;
  original_name: string;
  overview: string;
  first_air_date: string;
  poster_path: string | null;
  genre_ids: number[];
  vote_average: number;
  vote_count: number;
  popularity: number;
  origin_country: string[];
}

async function searchTMDBTV(
  title: string,
  year: number | undefined,
  apiKey: string
): Promise<TMDBTVResult[]> {
  try {
    const params = new URLSearchParams({
      query: title,
      language: 'en-US',
      page: '1',
    });
    if (year && year > 0) {
      params.set('first_air_date_year', String(year));
    }

    log.debug(MODULE, 'Searching TMDB TV', { query: title, year: year ?? null });

    const response = await fetch(
      `${TMDB_BASE_URL}/search/tv?${params.toString()}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );

    if (!response.ok) {
      log.warn(MODULE, 'TMDB TV search failed', {
        query: title,
        status: response.status,
        statusText: response.statusText,
      });
      return [];
    }
    const data = await response.json();
    const results = data.results?.slice(0, 5) ?? [];

    log.debug(MODULE, 'TMDB TV search results', {
      query: title,
      totalResults: data.total_results ?? 0,
      returnedResults: results.length,
      titles: results.map((r: TMDBTVResult) => `${r.name} (${r.first_air_date?.slice(0, 4) ?? '?'})`),
    });

    return results;
  } catch (err) {
    log.error(MODULE, 'TMDB TV search exception', {
      query: title,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

// ─── TMDB Movie Details (for director, runtime, IMDB ID) ─

interface TMDBMovieDetails {
  id: number;
  imdb_id: string | null;
  runtime: number | null;
  credits?: {
    crew?: Array<{ job: string; name: string }>;
  };
}

async function getMovieDetails(tmdbId: number, apiKey: string): Promise<TMDBMovieDetails | null> {
  try {
    log.debug(MODULE, 'Fetching TMDB movie details', { tmdbId });

    const response = await fetch(
      `${TMDB_BASE_URL}/movie/${tmdbId}?append_to_response=credits&language=en-US`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!response.ok) {
      log.warn(MODULE, 'TMDB movie details fetch failed', { tmdbId, status: response.status });
      return null;
    }
    const details = await response.json();

    log.debug(MODULE, 'TMDB movie details fetched', {
      tmdbId,
      imdbId: details.imdb_id ?? null,
      runtime: details.runtime ?? null,
      hasCredits: !!details.credits?.crew?.length,
    });

    return details;
  } catch (err) {
    log.error(MODULE, 'TMDB movie details exception', {
      tmdbId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── TMDB TV Details (for network, seasons, IMDB ID) ─────

interface TMDBTVDetails {
  id: number;
  external_ids?: { imdb_id?: string | null };
  number_of_seasons: number | null;
  status: string | null;
  networks?: Array<{ name: string }>;
  created_by?: Array<{ name: string }>;
}

async function getTVDetails(tmdbId: number, apiKey: string): Promise<TMDBTVDetails | null> {
  try {
    log.debug(MODULE, 'Fetching TMDB TV details', { tmdbId });

    const response = await fetch(
      `${TMDB_BASE_URL}/tv/${tmdbId}?append_to_response=external_ids&language=en-US`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!response.ok) {
      log.warn(MODULE, 'TMDB TV details fetch failed', { tmdbId, status: response.status });
      return null;
    }
    const details = await response.json();

    log.debug(MODULE, 'TMDB TV details fetched', {
      tmdbId,
      imdbId: details.external_ids?.imdb_id ?? null,
      seasons: details.number_of_seasons ?? null,
      status: details.status ?? null,
      network: details.networks?.[0]?.name ?? null,
    });

    return details;
  } catch (err) {
    log.error(MODULE, 'TMDB TV details exception', {
      tmdbId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── TMDB Find by IMDB ID ───────────────────────────────

export async function findByImdbId(
  imdbId: string,
  apiKey: string
): Promise<{ tmdbId: number; type: 'movie' | 'tv' } | null> {
  try {
    log.debug(MODULE, 'Looking up TMDB by IMDB ID', { imdbId });

    const response = await fetch(
      `${TMDB_BASE_URL}/find/${imdbId}?external_source=imdb_id&language=en-US`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    if (!response.ok) {
      log.warn(MODULE, 'TMDB find by IMDB ID failed', { imdbId, status: response.status });
      return null;
    }
    const data = await response.json();

    if (data.movie_results?.length > 0) {
      log.debug(MODULE, 'TMDB found movie by IMDB ID', { imdbId, tmdbId: data.movie_results[0].id });
      return { tmdbId: data.movie_results[0].id, type: 'movie' };
    }
    if (data.tv_results?.length > 0) {
      log.debug(MODULE, 'TMDB found TV show by IMDB ID', { imdbId, tmdbId: data.tv_results[0].id });
      return { tmdbId: data.tv_results[0].id, type: 'tv' };
    }

    log.debug(MODULE, 'TMDB find by IMDB ID returned no results', { imdbId });
    return null;
  } catch (err) {
    log.error(MODULE, 'TMDB find by IMDB ID exception', {
      imdbId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

// ─── Build Unmatched Result ──────────────────────────────

function buildUnmatched(item: LLMIdentifiedItem): EnrichedItem {
  return {
    title: item.title,
    creator: item.creator,
    type: item.type,
    confidence: 'unmatched',
    source: 'none',
    tmdbId: null,
    imdbId: null,
    tvdbId: null,
    posterUrl: null,
    overview: null,
    rating: null,
    releaseDate: null,
    genres: null,
    year: item.year ?? null,
    director: null,
    runtime: null,
    network: null,
    seasons: null,
    showStatus: null,
    plexMatch: false,
    plexRatingKey: null,
  };
}

// ─── Enrich Single Movie ─────────────────────────────────

async function enrichMovie(item: LLMIdentifiedItem, apiKey: string): Promise<EnrichedItem> {
  log.info(MODULE, 'Enriching movie', { title: item.title, year: item.year ?? null, creator: item.creator });

  const results = await searchTMDBMovies(item.title, item.year, apiKey);
  if (results.length === 0) {
    log.warn(MODULE, 'No TMDB movie results found', { title: item.title, year: item.year ?? null });
    return buildUnmatched(item);
  }

  // Score each result
  let bestResult: TMDBMovieResult | null = null;
  let bestScore = 0;

  for (const result of results) {
    const score = computeTitleScore(item.title, result.title);
    // Bonus for year match
    const resultYear = result.release_date ? parseInt(result.release_date.slice(0, 4)) : 0;
    const yearBonus = item.year && resultYear === item.year ? 0.1 : 0;
    const totalScore = Math.min(score + yearBonus, 1);

    log.debug(MODULE, 'Movie candidate scored', {
      queryTitle: item.title,
      candidateTitle: result.title,
      candidateYear: resultYear || null,
      titleScore: Math.round(score * 1000) / 1000,
      yearBonus,
      totalScore: Math.round(totalScore * 1000) / 1000,
      tmdbId: result.id,
    });

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestResult = result;
    }
  }

  if (!bestResult) {
    log.warn(MODULE, 'No best movie result after scoring', { title: item.title });
    return buildUnmatched(item);
  }

  const confidence = scoreToConfidence(bestScore);
  log.info(MODULE, 'Movie match result', {
    title: item.title,
    matchedTitle: bestResult.title,
    matchedYear: bestResult.release_date?.slice(0, 4) ?? null,
    bestScore: Math.round(bestScore * 1000) / 1000,
    confidence,
    tmdbId: bestResult.id,
  });

  if (confidence === 'unmatched') {
    log.warn(MODULE, 'Movie best score below threshold', {
      title: item.title,
      bestScore: Math.round(bestScore * 1000) / 1000,
      threshold: 0.50,
      bestCandidate: bestResult.title,
    });
    return buildUnmatched(item);
  }

  // Fetch details for director, runtime, IMDB ID
  const details = await getMovieDetails(bestResult.id, apiKey);
  const director = details?.credits?.crew?.find(c => c.job === 'Director')?.name ?? null;
  const runtime = details?.runtime ?? null;
  const imdbId = details?.imdb_id ?? null;
  const releaseYear = bestResult.release_date ? parseInt(bestResult.release_date.slice(0, 4)) : null;

  log.debug(MODULE, 'Movie enrichment complete', {
    title: item.title,
    director,
    runtime,
    imdbId,
    releaseYear,
  });

  return {
    title: item.title,
    creator: director || item.creator,
    type: 'movie',
    confidence,
    source: 'tmdb' as MetadataSource,
    tmdbId: bestResult.id,
    imdbId,
    tvdbId: null, // resolved later via TVDB supplemental lookup
    posterUrl: bestResult.poster_path ? `${TMDB_IMAGE_BASE}${bestResult.poster_path}` : null,
    overview: bestResult.overview?.slice(0, 500) ?? null,
    rating: bestResult.vote_average ?? null,
    releaseDate: bestResult.release_date ?? null,
    genres: resolveGenres(bestResult.genre_ids),
    year: releaseYear,
    director,
    runtime,
    network: null,
    seasons: null,
    showStatus: null,
    plexMatch: false,
    plexRatingKey: null,
  };
}

// ─── Enrich Single TV Show ───────────────────────────────

async function enrichTV(item: LLMIdentifiedItem, apiKey: string): Promise<EnrichedItem> {
  log.info(MODULE, 'Enriching TV show', { title: item.title, year: item.year ?? null, creator: item.creator });

  // Extract the base series name (without season suffixes) for better TMDB matching.
  // The LLM often returns "Show - Season 1" but TMDB indexes by series name only.
  const seriesName = extractSeriesName(item.title);
  const searchTitle = seriesName !== item.title ? seriesName : item.title;

  log.debug(MODULE, 'TV search title', {
    originalTitle: item.title,
    searchTitle,
    wasStripped: seriesName !== item.title,
  });

  let results = await searchTMDBTV(searchTitle, item.year, apiKey);

  // If the cleaned title returned no results, try the original title as fallback
  if (results.length === 0 && searchTitle !== item.title) {
    log.debug(MODULE, 'No results with cleaned title, retrying with original', {
      cleanedTitle: searchTitle,
      originalTitle: item.title,
    });
    results = await searchTMDBTV(item.title, item.year, apiKey);
  }

  // If still no results and we have a year filter, try without it
  if (results.length === 0 && item.year && item.year > 0) {
    log.debug(MODULE, 'No results with year filter, retrying without year', {
      title: searchTitle,
      year: item.year,
    });
    results = await searchTMDBTV(searchTitle, undefined, apiKey);
  }

  if (results.length === 0) {
    log.warn(MODULE, 'No TMDB TV results found', { title: item.title, year: item.year ?? null });
    return buildUnmatched(item);
  }

  // Score each result
  let bestResult: TMDBTVResult | null = null;
  let bestScore = 0;

  for (const result of results) {
    const score = computeTitleScore(item.title, result.name);
    const resultYear = result.first_air_date ? parseInt(result.first_air_date.slice(0, 4)) : 0;
    const yearBonus = item.year && resultYear === item.year ? 0.1 : 0;
    const totalScore = Math.min(score + yearBonus, 1);

    log.debug(MODULE, 'TV candidate scored', {
      queryTitle: item.title,
      candidateName: result.name,
      candidateYear: resultYear || null,
      titleScore: Math.round(score * 1000) / 1000,
      yearBonus,
      totalScore: Math.round(totalScore * 1000) / 1000,
      tmdbId: result.id,
      originCountry: result.origin_country,
    });

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestResult = result;
    }
  }

  if (!bestResult) {
    log.warn(MODULE, 'No best TV result after scoring', { title: item.title });
    return buildUnmatched(item);
  }

  const confidence = scoreToConfidence(bestScore);
  log.info(MODULE, 'TV match result', {
    title: item.title,
    matchedName: bestResult.name,
    matchedYear: bestResult.first_air_date?.slice(0, 4) ?? null,
    bestScore: Math.round(bestScore * 1000) / 1000,
    confidence,
    tmdbId: bestResult.id,
  });

  if (confidence === 'unmatched') {
    log.warn(MODULE, 'TV best score below threshold', {
      title: item.title,
      bestScore: Math.round(bestScore * 1000) / 1000,
      threshold: 0.50,
      bestCandidate: bestResult.name,
    });
    return buildUnmatched(item);
  }

  // Fetch details for network, seasons, IMDB ID
  const details = await getTVDetails(bestResult.id, apiKey);
  const imdbId = details?.external_ids?.imdb_id ?? null;
  const network = details?.networks?.[0]?.name ?? null;
  const seasons = details?.number_of_seasons ?? null;
  const showStatus = details?.status ?? null;
  const createdBy = details?.created_by?.map(c => c.name).join(', ') ?? null;
  const firstAirYear = bestResult.first_air_date ? parseInt(bestResult.first_air_date.slice(0, 4)) : null;

  log.debug(MODULE, 'TV enrichment complete', {
    title: item.title,
    imdbId,
    network,
    seasons,
    showStatus,
    createdBy,
    firstAirYear,
  });

  return {
    title: item.title,
    creator: createdBy || item.creator,
    type: 'tv',
    confidence,
    source: 'tmdb' as MetadataSource,
    tmdbId: bestResult.id,
    imdbId,
    tvdbId: null, // resolved later via TVDB supplemental lookup
    posterUrl: bestResult.poster_path ? `${TMDB_IMAGE_BASE}${bestResult.poster_path}` : null,
    overview: bestResult.overview?.slice(0, 500) ?? null,
    rating: bestResult.vote_average ?? null,
    releaseDate: bestResult.first_air_date ?? null,
    genres: resolveGenres(bestResult.genre_ids),
    year: firstAirYear,
    director: null,
    runtime: null,
    network,
    seasons,
    showStatus,
    plexMatch: false,
    plexRatingKey: null,
  };
}

// ─── Enrich Single Item (dispatch by type) ───────────────

async function enrichSingleItem(item: LLMIdentifiedItem, apiKey: string): Promise<EnrichedItem> {
  log.info(MODULE, 'Dispatching enrichment', {
    title: item.title,
    type: item.type,
    year: item.year ?? null,
    creator: item.creator,
  });

  switch (item.type) {
    case 'movie':
      return enrichMovie(item, apiKey);

    case 'tv':
      return enrichTV(item, apiKey);

    case 'dvd': {
      log.info(MODULE, 'DVD type detected, trying movie first then TV', { title: item.title });
      const movieResult = await enrichMovie(item, apiKey);
      if (movieResult.confidence !== 'unmatched') {
        log.info(MODULE, 'DVD matched as movie', {
          title: item.title,
          confidence: movieResult.confidence,
          tmdbId: movieResult.tmdbId,
        });
        return movieResult;
      }
      log.info(MODULE, 'DVD not matched as movie, trying TV', { title: item.title });
      const tvResult = await enrichTV(item, apiKey);
      if (tvResult.confidence !== 'unmatched') {
        log.info(MODULE, 'DVD matched as TV show', {
          title: item.title,
          confidence: tvResult.confidence,
          tmdbId: tvResult.tmdbId,
        });
        return tvResult;
      }
      log.warn(MODULE, 'DVD could not be matched as movie or TV', { title: item.title });
      return buildUnmatched(item);
    }

    default:
      log.info(MODULE, 'Item type has no TMDB enrichment', { title: item.title, type: item.type });
      return buildUnmatched(item);
  }
}

// ─── Public API ──────────────────────────────────────────

export async function enrichItems(
  items: LLMIdentifiedItem[],
  tvdbApiKey?: string
): Promise<EnrichedItem[]> {
  const tmdbApiKey = getTmdbApiKey();

  log.info(MODULE, 'Starting metadata enrichment', {
    itemCount: items.length,
    hasTvdbKey: !!tvdbApiKey,
    items: items.map(i => ({ title: i.title, type: i.type, year: i.year ?? null })),
  });

  // Load genre cache first
  await loadGenreCache(tmdbApiKey);

  const results = await Promise.allSettled(
    items.map(item => enrichSingleItem(item, tmdbApiKey))
  );

  const enriched = results.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value;
    }
    log.error(MODULE, 'Item enrichment rejected', {
      title: items[i].title,
      reason: result.reason instanceof Error ? result.reason.message : String(result.reason),
    });
    return buildUnmatched(items[i]);
  });

  // Log enrichment summary
  const matched = enriched.filter(e => e.confidence !== 'unmatched');
  const highConf = enriched.filter(e => e.confidence === 'high');
  const lowConf = enriched.filter(e => e.confidence === 'low');
  const unmatched = enriched.filter(e => e.confidence === 'unmatched');

  log.info(MODULE, 'TMDB enrichment summary', {
    total: enriched.length,
    matched: matched.length,
    highConfidence: highConf.length,
    lowConfidence: lowConf.length,
    unmatched: unmatched.length,
    unmatchedTitles: unmatched.map(e => e.title),
  });

  // Supplemental TVDB lookup: resolve TVDB IDs for matched items
  const effectiveTvdbKey = tvdbApiKey || (isTVDBConfigured() ? process.env.TVDB_API_KEY : undefined);
  if (effectiveTvdbKey) {
    log.info(MODULE, 'Starting TVDB supplemental lookup', {
      eligibleItems: matched.length,
    });

    const tvdbResults = await Promise.allSettled(
      enriched.map(item => {
        if (item.confidence === 'unmatched') {
          return Promise.resolve(null);
        }
        return resolveTVDBId(item.title, item.year, item.imdbId, item.type);
      })
    );

    let tvdbResolved = 0;
    let tvdbFailed = 0;

    for (let i = 0; i < enriched.length; i++) {
      const tvdbResult = tvdbResults[i];
      if (tvdbResult.status === 'fulfilled' && tvdbResult.value != null) {
        enriched[i].tvdbId = tvdbResult.value;
        tvdbResolved++;
        log.debug(MODULE, 'TVDB ID resolved', {
          title: enriched[i].title,
          tvdbId: tvdbResult.value,
        });
      } else if (tvdbResult.status === 'rejected') {
        tvdbFailed++;
        log.warn(MODULE, 'TVDB lookup rejected', {
          title: enriched[i].title,
          reason: tvdbResult.reason instanceof Error ? tvdbResult.reason.message : String(tvdbResult.reason),
        });
      } else if (enriched[i].confidence !== 'unmatched' && tvdbResult.status === 'fulfilled' && tvdbResult.value == null) {
        log.debug(MODULE, 'TVDB ID not found', { title: enriched[i].title });
      }
    }

    log.info(MODULE, 'TVDB supplemental lookup complete', {
      resolved: tvdbResolved,
      failed: tvdbFailed,
      skipped: enriched.length - matched.length,
    });
  } else {
    log.debug(MODULE, 'Skipping TVDB lookup (no API key)');
  }

  log.info(MODULE, 'Metadata enrichment complete', {
    total: enriched.length,
    results: enriched.map(e => ({
      title: e.title,
      type: e.type,
      confidence: e.confidence,
      tmdbId: e.tmdbId,
      imdbId: e.imdbId,
      tvdbId: e.tvdbId,
    })),
  });

  return enriched;
}
