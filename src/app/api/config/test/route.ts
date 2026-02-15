import { NextRequest } from 'next/server';
import { z } from 'zod';
import { isOpenRouterConfigured } from '@/lib/openrouter';
import { isTMDBConfigured } from '@/lib/metadata';
import { isTVDBConfigured, testTVDBConnection } from '@/lib/tvdb';
import { isPlexConfigured, fetchPlexLibraries } from '@/lib/plex';
import { OPENROUTER_BASE_URL } from '@/lib/constants';
import { log } from '@/lib/logger';

const MODULE = 'api:config:test';

const TestRequestSchema = z.object({
  service: z.enum(['openrouter', 'tmdb', 'tvdb', 'plex']),
});

async function testOpenRouter(): Promise<{ ok: boolean; message: string; details?: object }> {
  if (!isOpenRouterConfigured()) {
    return { ok: false, message: 'OPENROUTER_API_KEY is not configured' };
  }

  try {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models`, {
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      },
    });

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        message: `OpenRouter API returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const modelCount = data?.data?.length ?? 0;
    return {
      ok: true,
      message: `Connected to OpenRouter (${modelCount} models available)`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testTMDB(): Promise<{ ok: boolean; message: string; details?: object }> {
  if (!isTMDBConfigured()) {
    return { ok: false, message: 'TMDB_API_KEY is not configured' };
  }

  try {
    const response = await fetch(
      'https://api.themoviedb.org/3/genre/movie/list?language=en-US',
      {
        headers: { Authorization: `Bearer ${process.env.TMDB_API_KEY}` },
      }
    );

    if (!response.ok) {
      const body = await response.text();
      return {
        ok: false,
        message: `TMDB API returned ${response.status}: ${body.slice(0, 200)}`,
      };
    }

    const data = await response.json();
    const genreCount = data?.genres?.length ?? 0;
    return {
      ok: true,
      message: `Connected to TMDB (${genreCount} genres available)`,
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

async function testTVDB(): Promise<{ ok: boolean; message: string; details?: object }> {
  if (!isTVDBConfigured()) {
    return { ok: false, message: 'TVDB_API_KEY is not configured' };
  }

  return testTVDBConnection();
}

async function testPlex(): Promise<{ ok: boolean; message: string; details?: object }> {
  if (!isPlexConfigured()) {
    return { ok: false, message: 'PLEX_URL and/or PLEX_TOKEN is not configured' };
  }

  try {
    const libraries = await fetchPlexLibraries();
    const movieLibs = libraries.filter(l => l.type === 'movie').length;
    const showLibs = libraries.filter(l => l.type === 'show').length;
    return {
      ok: true,
      message: `Connected: ${movieLibs} movie library(ies), ${showLibs} TV library(ies)`,
      details: { libraries: libraries.map(l => ({ title: l.title, type: l.type })) },
    };
  } catch (err) {
    return {
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const validated = TestRequestSchema.safeParse(body);

    if (!validated.success) {
      return Response.json(
        { error: 'Invalid request body', code: 'INVALID_BODY' },
        { status: 400 }
      );
    }

    const { service } = validated.data;

    log.info(MODULE, 'Testing service connectivity', { service });

    let result: { ok: boolean; message: string; details?: object };

    switch (service) {
      case 'openrouter':
        result = await testOpenRouter();
        break;
      case 'tmdb':
        result = await testTMDB();
        break;
      case 'tvdb':
        result = await testTVDB();
        break;
      case 'plex':
        result = await testPlex();
        break;
      default:
        return Response.json(
          { error: 'Unknown service', code: 'UNKNOWN_SERVICE' },
          { status: 400 }
        );
    }

    log.info(MODULE, 'Service test result', { service, ok: result.ok, message: result.message });

    return Response.json(result);
  } catch (error) {
    log.error(MODULE, 'Unexpected error in /api/config/test', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json(
      { error: 'Internal server error', code: 'INTERNAL_ERROR' },
      { status: 500 }
    );
  }
}
