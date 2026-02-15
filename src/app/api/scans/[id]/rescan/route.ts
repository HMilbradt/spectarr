import { NextRequest } from 'next/server';
import { runRescan } from '@/lib/scan-orchestrator';
import { createSSEStream } from '@/lib/sse';
import { log } from '@/lib/logger';

const MODULE = 'api:scans:rescan';

type RouteParams = { params: Promise<{ id: string }> };

/** POST /api/scans/[id]/rescan — Re-scan same image with new LLM call. Returns SSE stream. */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    let modelId: string | undefined;
    try {
      const body = await request.json();
      modelId = body.modelId;
    } catch {
      // No body or invalid JSON — use original model
    }

    const { response, writer } = createSSEStream();

    runRescan(id, modelId, writer).catch(error => {
      log.error(MODULE, 'Rescan pipeline failed', {
        scanId: id,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return response;
  } catch (error) {
    log.error(MODULE, 'Error in POST /api/scans/[id]/rescan', {
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ error: 'Internal server error', code: 'INTERNAL_ERROR' }, { status: 500 });
  }
}
