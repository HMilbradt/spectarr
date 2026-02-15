import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/index';
import { scans, scanItems, usageRecords } from '@/lib/db/schema';
import { log } from '@/lib/logger';
import type { ScanItemRow, ScanStatus } from '@/types';

const MODULE = 'api:scans:[id]';

type RouteParams = { params: Promise<{ id: string }> };

/** GET /api/scans/[id] — Get single scan with all items. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const db = getDb();

    const scan = db.select().from(scans).where(eq(scans.id, id)).get();
    if (!scan) {
      return Response.json({ error: 'Scan not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    const items = db.select().from(scanItems).where(eq(scanItems.scanId, id)).all();

    return Response.json({
      id: scan.id,
      imageId: scan.imageId,
      modelId: scan.modelId,
      status: scan.status as ScanStatus,
      createdAt: scan.createdAt,
      updatedAt: scan.updatedAt,
      items: items as ScanItemRow[],
    });
  } catch (error) {
    log.error(MODULE, 'Error in GET /api/scans/[id]', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}

/** DELETE /api/scans/[id] — Hard-delete scan, its items, and usage records. */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const db = getDb();

    const scan = db.select().from(scans).where(eq(scans.id, id)).get();
    if (!scan) {
      return Response.json({ error: 'Scan not found', code: 'NOT_FOUND' }, { status: 404 });
    }

    // Cascade is configured in schema, but let's be explicit
    db.delete(usageRecords).where(eq(usageRecords.scanId, id)).run();
    db.delete(scanItems).where(eq(scanItems.scanId, id)).run();
    db.delete(scans).where(eq(scans.id, id)).run();

    log.info(MODULE, 'Scan deleted', { scanId: id });

    return Response.json({ success: true });
  } catch (error) {
    log.error(MODULE, 'Error in DELETE /api/scans/[id]', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
