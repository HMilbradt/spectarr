/**
 * Server-Sent Events (SSE) utility for streaming responses from API routes.
 */

export type SSEWriter = {
  /** Send a named event with JSON data */
  send: (event: string, data: unknown) => void;
  /** Close the stream */
  close: () => void;
};

/**
 * Create an SSE response with a writer for sending events.
 * Returns both the Response object (to return from the API route)
 * and a writer object for pushing events.
 */
export function createSSEStream(): { response: Response; writer: SSEWriter } {
  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      controller = null;
    },
  });

  const writer: SSEWriter = {
    send(event: string, data: unknown) {
      if (!controller) return;
      try {
        const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
        controller.enqueue(encoder.encode(payload));
      } catch {
        // Stream may have been closed by client
      }
    },
    close() {
      if (!controller) return;
      try {
        controller.close();
      } catch {
        // Already closed
      }
      controller = null;
    },
  };

  const response = new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // Disable nginx buffering
    },
  });

  return { response, writer };
}
