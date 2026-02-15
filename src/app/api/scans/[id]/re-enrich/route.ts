import { NextRequest } from 'next/server';
import { runReenrich } from '@/lib/scan-orchestrator';
import { createSSEStream } from '@/lib/sse';
import { log } from '@/lib/logger';

const MODULE = 'api:scans:re-enrich';

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/scans/[id]/re-enrich — Re-enrich metadata from stored rawResponse. Returns SSE stream. */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const { response, writer } = createSSEStream();

    runReenrich(id, writer).catch(error => {
      log.error(MODULE, 'Re-enrich pipeline failed', {
        scanId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return response;
  } catch (error) {
    log.error(MODULE, 'Error in POST /api/scans/[id]/re-enrich', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
