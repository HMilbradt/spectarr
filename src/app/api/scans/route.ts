import { NextRequest } from 'next/server';
import { desc, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db/index';
import { scans } from '@/lib/db/schema';
import { runFullScan } from '@/lib/scan-orchestrator';
import { createSSEStream } from '@/lib/sse';
import { IMAGE_MAX_FILE_SIZE } from '@/lib/constants';
import { log } from '@/lib/logger';

const MODULE = 'api:scans';

/** POST /api/scans — Upload image and start scan. Returns SSE stream. */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageFile = formData.get('image') as File | null;
    const modelId = formData.get('modelId') as string | null;

    if (!imageFile) {
      return Response.json({ error: 'Image is required', code: 'MISSING_IMAGE' }, { status: 400 });
    }

    if (imageFile.size > IMAGE_MAX_FILE_SIZE) {
      return Response.json({ error: 'Image exceeds 20MB limit', code: 'IMAGE_TOO_LARGE' }, { status: 400 });
    }

    if (!modelId) {
      return Response.json({ error: 'Model ID is required', code: 'MISSING_MODEL' }, { status: 400 });
    }

    const imageBuffer = Buffer.from(await imageFile.arrayBuffer());
    const mimeType = imageFile.type || 'image/jpeg';

    const { response, writer } = createSSEStream();

    // Run scan pipeline asynchronously — results stream via SSE
    runFullScan({ imageBuffer, mimeType, modelId, writer }).catch(error => {
      log.error(MODULE, 'Scan pipeline failed', {
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return response;
  } catch (error) {
    log.error(MODULE, 'Error in POST /api/scans', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

/** GET /api/scans — List all scans with item counts and cost totals. */
export async function GET() {
  try {
    const db = getDb();

    const allScans = db
      .select({
        id: scans.id,
        imageId: scans.imageId,
        modelId: scans.modelId,
        status: scans.status,
        createdAt: scans.createdAt,
        updatedAt: scans.updatedAt,
        itemCount: sql<number>`(SELECT COUNT(*) FROM scan_items WHERE scan_id = ${scans.id})`,
        totalCost: sql<number>`COALESCE((SELECT SUM(cost_usd) FROM usage_records WHERE scan_id = ${scans.id}), 0)`,
      })
      .from(scans)
      .orderBy(desc(scans.createdAt))
      .all();

    return Response.json({ scans: allScans });
  } catch (error) {
    log.error(MODULE, 'Error in GET /api/scans', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
