import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/index';
import { scans, images } from '@/lib/db/schema';
import { log } from '@/lib/logger';

const MODULE = 'api:scans:image';

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/scans/[id]/image — Serve the scan's original image binary. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const db = getDb();

    const scan = db.select().from(scans).where(eq(scans.id, id)).get();
    if (!scan) {
      return Response.json({ error: 'Scan not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const image = db.select().from(images).where(eq(images.id, scan.imageId)).get();
    if (!image) {
      return Response.json({ error: 'Image not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    return new Response(new Uint8Array(image.data), {
      headers: {
        'Content-Type': image.mimeType,
        'Content-Length': String(image.data.length),
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    log.error(MODULE, 'Error in GET /api/scans/[id]/image', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
