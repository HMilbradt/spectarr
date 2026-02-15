import { desc } from 'drizzle-orm';
import { getDb } from '@/lib/db/index';
import { usageRecords } from '@/lib/db/schema';
import { log } from '@/lib/logger';

const MODULE = 'api:usage';

/** GET /api/usage — Get all usage records. */
export async function GET() {
  try {
    const db = getDb();

    const records = db
      .select()
      .from(usageRecords)
      .orderBy(desc(usageRecords.createdAt))
      .all();

    return Response.json({ records });
  } catch (error) {
    log.error(MODULE, 'Error in GET /api/usage', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
