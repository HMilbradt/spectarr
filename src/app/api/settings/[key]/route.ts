import { NextRequest } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/db/index';
import { settings } from '@/lib/db/schema';
import { log } from '@/lib/logger';

const MODULE = 'api:settings';

type RouteParams = { params: Promise<{ key: string }> };

/** PUT /api/settings/[key] — Create or update a setting. */
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { key } = await params;

  try {
    const body = await request.json();
    const { value } = body as { value?: string };

    if (value === undefined || value === null) {
      return Response.json({ error: 'Value is required', code: 'MISSING_VALUE' }, { status: 400 });
    }

    const db = getDb();
    const now = Date.now();

    const existing = db.select().from(settings).where(eq(settings.key, key)).get();

    if (existing) {
      db.update(settings)
        .set({ value: String(value), updatedAt: now })
        .where(eq(settings.key, key))
        .run();
    } else {
      db.insert(settings).values({
        key,
        value: String(value),
        updatedAt: now,
      }).run();
    }

    return Response.json({ key, value: String(value), updatedAt: now });
  } catch (error) {
    log.error(MODULE, 'Error in PUT /api/settings/[key]', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
