import { isOpenRouterConfigured } from '@/lib/openrouter';
import { isTMDBConfigured } from '@/lib/metadata';
import { isTVDBConfigured } from '@/lib/tvdb';
import { isPlexConfigured, getPlexUrl } from '@/lib/plex';
import { OPENROUTER_BASE_URL } from '@/lib/constants';

export async function GET() {
  const logLevel = process.env.LOG_LEVEL?.toLowerCase() || 'silent';

  return Response.json({
    services: {
      openrouter: {
        configured: isOpenRouterConfigured(),
        baseUrl: OPENROUTER_BASE_URL,
      },
      tmdb: {
        configured: isTMDBConfigured(),
      },
      tvdb: {
        configured: isTVDBConfigured(),
      },
      plex: {
        configured: isPlexConfigured(),
        url: getPlexUrl(),
      },
    },
    logLevel,
  });
}
