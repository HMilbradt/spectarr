import { NextRequest } from 'next/server';
import { eq, and } from 'drizzle-orm';
import { getDb } from '@/lib/db/index';
import { scanItems } from '@/lib/db/schema';
import { enrichItems } from '@/lib/metadata';
import { isPlexConfigured, fetchAllPlexItems, matchWithPlex } from '@/lib/plex';
import { log } from '@/lib/logger';
import type { ScanItemRow, LLMIdentifiedItem, ItemType } from '@/types';

const MODULE = 'api:scans:items';

type RouteParams = { params: Promise<{ id: string; itemId: string }> };

/** PUT /api/scans/[id]/items/[itemId] — Edit a single item and re-enrich it. */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id: scanId, itemId } = await params;

  try {
    const body = await request.json();
    const { title, creator } = body as { title?: string; creator?: string };

    if (!title) {
      return Response.json({ error: 'Title is required', code: 'MISSING_TITLE' }, { status: 400 });
    }

    const db = getDb();

    const item = db
      .select()
      .from(scanItems)
      .where(and(eq(scanItems.id, itemId), eq(scanItems.scanId, scanId)))
      .get();

    if (!item) {
      return Response.json({ error: 'Item not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    // Build LLM item shape for re-enrichment
    const llmItem: LLMIdentifiedItem = {
      title,
      creator: creator ?? item.creator,
      type: item.type as ItemType,
      year: item.rawYear ?? undefined,
    };

    // Re-enrich via TMDB
    const enriched = await enrichItems([llmItem]);
    const enrichedItem = enriched[0];

    // Cross-reference with Plex if configured
    if (isPlexConfigured() && enrichedItem) {
      try {
        const plexItems = await fetchAllPlexItems();
        const plexResult = matchWithPlex(enrichedItem.title, enrichedItem.year, plexItems);
        if (plexResult.matched) {
          enrichedItem.plexMatch = true;
          enrichedItem.plexRatingKey = plexResult.plexRatingKey;
          if (!enrichedItem.imdbId && plexResult.imdbId) enrichedItem.imdbId = plexResult.imdbId;
          if (!enrichedItem.tvdbId && plexResult.tvdbId) {
            enrichedItem.tvdbId = parseInt(plexResult.tvdbId, 10) || null;
          }
        }
      } catch (error) {
        log.warn(MODULE, 'Plex cross-reference failed during item edit', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const now = Date.now();
    const updates = {
      title: enrichedItem?.title ?? title,
      creator: enrichedItem?.creator ?? (creator ?? item.creator),
      type: enrichedItem?.type ?? item.type,
      confidence: enrichedItem?.confidence ?? item.confidence,
      source: enrichedItem?.source ?? item.source,
      tmdbId: enrichedItem?.tmdbId ?? null,
      imdbId: enrichedItem?.imdbId ?? null,
      tvdbId: enrichedItem?.tvdbId ?? null,
      posterUrl: enrichedItem?.posterUrl ?? null,
      overview: enrichedItem?.overview ?? null,
      rating: enrichedItem?.rating ?? null,
      releaseDate: enrichedItem?.releaseDate ?? null,
      genres: enrichedItem?.genres ?? null,
      year: enrichedItem?.year ?? null,
      director: enrichedItem?.director ?? null,
      runtime: enrichedItem?.runtime ?? null,
      network: enrichedItem?.network ?? null,
      seasons: enrichedItem?.seasons ?? null,
      showStatus: enrichedItem?.showStatus ?? null,
      plexMatch: enrichedItem?.plexMatch ?? false,
      plexRatingKey: enrichedItem?.plexRatingKey ?? null,
      rawTitle: title,
      rawCreator: creator ?? item.rawCreator,
      updatedAt: now,
    };

    db.update(scanItems)
      .set(updates)
      .where(eq(scanItems.id, itemId))
      .run();

    const updated = db.select().from(scanItems).where(eq(scanItems.id, itemId)).get();

    return Response.json(updated as ScanItemRow);
  } catch (error) {
    log.error(MODULE, 'Error in PUT /api/scans/[id]/items/[itemId]', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
