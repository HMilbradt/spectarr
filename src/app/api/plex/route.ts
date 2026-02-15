import { NextRequest } from 'next/server';
import { z } from 'zod';
import { fetchPlexLibraries, fetchAllPlexItems, isPlexConfigured } from '@/lib/plex';
import { log } from '@/lib/logger';

const MODULE = 'api:plex';

const PlexRequestSchema = z.object({
  action: z.enum(['libraries', 'items']),
});

export async function POST(request: NextRequest) {
  try {
    if (!isPlexConfigured()) {
      log.warn(MODULE, 'Plex not configured');
      return Response.json(
        { error: 'Plex is not configured on the server', code: 'SERVICE_NOT_CONFIGURED' },
        { status: 503 }
      );
    }

    const body = await request.json();
    const validated = PlexRequestSchema.safeParse(body);

    if (!validated.success) {
      return Response.json(
        { error: 'Invalid request body', code: 'INVALID_BODY' },
        { status: 400 }
      );
    }

    const { action } = validated.data;

    if (action === 'libraries') {
      const libraries = await fetchPlexLibraries();
      return Response.json({ libraries });
    }

    if (action === 'items') {
      const items = await fetchAllPlexItems();
      return Response.json({ items });
    }

    return Response.json(
      { error: 'Unknown action', code: 'UNKNOWN_ACTION' },
      { status: 400 }
    );
  } catch (error) {
    log.error(MODULE, 'Plex API error', {
      error: error instanceof Error ? error.message : String(error),
    });
    const message = error instanceof Error ? error.message : 'Unknown error';
    return Response.json(
      { error: message, code: 'PLEX_ERROR' },
      { status: 502 }
    );
  }
}
