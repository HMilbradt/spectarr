import type { PlexLibrary, PlexItem, PlexGuid } from '@/types';
import { log } from '@/lib/logger';

const MODULE = 'plex';

// ─── Configuration ───────────────────────────────────────

function getPlexConfig(): { plexUrl: string; plexToken: string } {
  const plexUrl = process.env.PLEX_URL;
  const plexToken = process.env.PLEX_TOKEN;
  if (!plexUrl || !plexToken) {
    throw new Error('PLEX_URL and PLEX_TOKEN environment variables are not configured');
  }
  return { plexUrl, plexToken };
}

export function isPlexConfigured(): boolean {
  return !!process.env.PLEX_URL && !!process.env.PLEX_TOKEN;
}

export function getPlexUrl(): string | null {
  return process.env.PLEX_URL || null;
}

// ─── GUID Parsing ────────────────────────────────────────

function parseGuids(item: Record<string, unknown>): PlexGuid {
  const guids: PlexGuid = {};

  // Modern Plex: Guid array with id fields like "imdb://tt0103639"
  const guidArray = item.Guid as Array<{ id: string }> | undefined;
  if (Array.isArray(guidArray)) {
    for (const g of guidArray) {
      if (typeof g.id === 'string') {
        if (g.id.startsWith('imdb://')) {
          guids.imdbId = g.id.replace('imdb://', '');
        } else if (g.id.startsWith('tmdb://')) {
          guids.tmdbId = g.id.replace('tmdb://', '');
        } else if (g.id.startsWith('tvdb://')) {
          guids.tvdbId = g.id.replace('tvdb://', '');
        }
      }
    }
  }

  // Legacy Plex: guid attribute like "com.plexapp.agents.imdb://tt0103639?lang=en"
  if (!guids.imdbId && !guids.tmdbId) {
    const legacyGuid = item.guid as string | undefined;
    if (typeof legacyGuid === 'string') {
      if (legacyGuid.includes('imdb://')) {
        const match = legacyGuid.match(/imdb:\/\/([^?]+)/);
        if (match) guids.imdbId = match[1];
      } else if (legacyGuid.includes('themoviedb://')) {
        const match = legacyGuid.match(/themoviedb:\/\/([^?]+)/);
        if (match) guids.tmdbId = match[1];
      } else if (legacyGuid.includes('thetvdb://')) {
        const match = legacyGuid.match(/thetvdb:\/\/([^?]+)/);
        if (match) guids.tvdbId = match[1];
      }
    }
  }

  return guids;
}

// ─── Fetch Plex Libraries ────────────────────────────────

export async function fetchPlexLibraries(
  plexUrlOverride?: string,
  plexTokenOverride?: string
): Promise<PlexLibrary[]> {
  const plexUrl = plexUrlOverride || getPlexConfig().plexUrl;
  const plexToken = plexTokenOverride || getPlexConfig().plexToken;
  const url = `${plexUrl.replace(/\/+$/, '')}/library/sections`;

  log.info(MODULE, 'Fetching Plex libraries', { url });

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': plexToken,
      'X-Plex-Client-Identifier': 'spectarr',
      'X-Plex-Product': 'Spectarr',
    },
  });

  if (!response.ok) {
    log.error(MODULE, 'Plex libraries fetch failed', { status: response.status, statusText: response.statusText });
    throw new Error(`Plex API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const directories = data?.MediaContainer?.Directory ?? [];

  const libraries = directories
    .filter((d: Record<string, unknown>) =>
      d.type === 'movie' || d.type === 'show'
    )
    .map((d: Record<string, unknown>) => ({
      key: String(d.key),
      title: String(d.title),
      type: d.type as 'movie' | 'show',
    }));

  log.info(MODULE, 'Plex libraries fetched', {
    totalDirectories: directories.length,
    filteredLibraries: libraries.length,
    libraries: libraries.map((l: PlexLibrary) => ({ title: l.title, type: l.type, key: l.key })),
  });

  return libraries;
}

// ─── Fetch All Items from a Library ──────────────────────

export async function fetchPlexLibraryItems(
  sectionKey: string,
  plexUrlOverride?: string,
  plexTokenOverride?: string
): Promise<PlexItem[]> {
  const plexUrl = plexUrlOverride || getPlexConfig().plexUrl;
  const plexToken = plexTokenOverride || getPlexConfig().plexToken;
  const baseUrl = plexUrl.replace(/\/+$/, '');
  const url = `${baseUrl}/library/sections/${sectionKey}/all?includeGuids=1`;

  log.debug(MODULE, 'Fetching Plex library items', { sectionKey, url });

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Plex-Token': plexToken,
      'X-Plex-Client-Identifier': 'spectarr',
      'X-Plex-Product': 'Spectarr',
    },
  });

  if (!response.ok) {
    log.error(MODULE, 'Plex library items fetch failed', {
      sectionKey,
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(`Plex API error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  const metadata = data?.MediaContainer?.Metadata ?? [];

  const items = metadata.map((item: Record<string, unknown>) => ({
    ratingKey: String(item.ratingKey),
    title: String(item.title ?? ''),
    year: typeof item.year === 'number' ? item.year : null,
    guids: parseGuids(item),
    type: data?.MediaContainer?.viewGroup === 'show' ? 'show' : 'movie',
  }));

  log.info(MODULE, 'Plex library items fetched', {
    sectionKey,
    itemCount: items.length,
  });

  return items;
}

// ─── Fetch All Plex Items (All Libraries) ────────────────

export async function fetchAllPlexItems(): Promise<PlexItem[]> {
  log.info(MODULE, 'Fetching all Plex items across libraries');

  const libraries = await fetchPlexLibraries();
  const allItems: PlexItem[] = [];

  for (const lib of libraries) {
    log.debug(MODULE, 'Fetching items from library', { title: lib.title, type: lib.type, key: lib.key });
    const items = await fetchPlexLibraryItems(lib.key);
    // Tag each item's type based on the library type
    const typedItems = items.map(item => ({
      ...item,
      type: lib.type === 'show' ? 'show' as const : 'movie' as const,
    }));
    allItems.push(...typedItems);
  }

  log.info(MODULE, 'All Plex items fetched', {
    libraryCount: libraries.length,
    totalItems: allItems.length,
  });

  return allItems;
}

// ─── Cross-Reference Scan Results with Plex ──────────────

function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PlexMatchResult {
  matched: boolean;
  plexRatingKey: string | null;
  imdbId: string | null;
  tmdbId: string | null;
  tvdbId: string | null;
}

export function matchWithPlex(
  title: string,
  year: number | null,
  plexItems: PlexItem[]
): PlexMatchResult {
  const normalizedQuery = normalizeTitle(title);

  log.debug(MODULE, 'Attempting Plex match', {
    title,
    normalizedQuery,
    year,
    plexItemCount: plexItems.length,
  });

  for (const plexItem of plexItems) {
    const normalizedPlex = normalizeTitle(plexItem.title);

    // Exact title match (normalized)
    if (normalizedQuery === normalizedPlex) {
      // If year is available, confirm year match (allow +/- 1 year tolerance)
      if (year && plexItem.year && Math.abs(year - plexItem.year) > 1) {
        log.debug(MODULE, 'Plex exact title match rejected due to year mismatch', {
          title,
          plexTitle: plexItem.title,
          queryYear: year,
          plexYear: plexItem.year,
        });
        continue;
      }
      log.info(MODULE, 'Plex exact title match found', {
        title,
        plexTitle: plexItem.title,
        plexYear: plexItem.year,
        ratingKey: plexItem.ratingKey,
        guids: plexItem.guids,
      });
      return {
        matched: true,
        plexRatingKey: plexItem.ratingKey,
        imdbId: plexItem.guids.imdbId ?? null,
        tmdbId: plexItem.guids.tmdbId ?? null,
        tvdbId: plexItem.guids.tvdbId ?? null,
      };
    }

    // Fuzzy match: check if one title contains the other
    if (
      normalizedQuery.includes(normalizedPlex) ||
      normalizedPlex.includes(normalizedQuery)
    ) {
      if (year && plexItem.year && Math.abs(year - plexItem.year) > 1) {
        log.debug(MODULE, 'Plex substring match rejected due to year mismatch', {
          title,
          plexTitle: plexItem.title,
          queryYear: year,
          plexYear: plexItem.year,
        });
        continue;
      }
      log.info(MODULE, 'Plex substring match found', {
        title,
        normalizedQuery,
        plexTitle: plexItem.title,
        normalizedPlex,
        plexYear: plexItem.year,
        ratingKey: plexItem.ratingKey,
        guids: plexItem.guids,
      });
      return {
        matched: true,
        plexRatingKey: plexItem.ratingKey,
        imdbId: plexItem.guids.imdbId ?? null,
        tmdbId: plexItem.guids.tmdbId ?? null,
        tvdbId: plexItem.guids.tvdbId ?? null,
      };
    }
  }

  log.debug(MODULE, 'No Plex match found', { title, normalizedQuery, year });

  return {
    matched: false,
    plexRatingKey: null,
    imdbId: null,
    tmdbId: null,
    tvdbId: null,
  };
}
