import { getDb } from '@/lib/db/index';
import { settings } from '@/lib/db/schema';
import { log } from '@/lib/logger';

const MODULE = 'api:settings';

/** GET /api/settings — Get all settings. */
export async function GET() {
  try {
    const db = getDb();
    const allSettings = db.select().from(settings).all();

    // Return as key-value map for convenience
    const settingsMap: Record<string, string> = {};
    for (const s of allSettings) {
      settingsMap[s.key] = s.value;
    }

    return Response.json({ settings: settingsMap });
  } catch (error) {
    log.error(MODULE, 'Error in GET /api/settings', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
