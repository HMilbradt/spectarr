import { useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/use-queries';
import type { ScanStatus, ScanDetail } from '@/types';

/**
 * Parse SSE events from a ReadableStream (for POST-based SSE where
 * EventSource can't be used).
 */
async function* parseSSE(reader: ReadableStreamDefaultReader<Uint8Array>): AsyncGenerator<{ event: string; data: string }> {
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    let currentEvent = '';
    let currentData = '';

    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith('data: ')) {
        currentData = line.slice(6).trim();
      } else if (line === '' && currentEvent && currentData) {
        yield { event: currentEvent, data: currentData };
        currentEvent = '';
        currentData = '';
      }
    }
  }
}

export interface ScanStreamState {
  isStreaming: boolean;
  scanId: string | null;
  status: ScanStatus | null;
  scan: ScanDetail | null;
  error: string | null;
}

/**
 * Hook to manage SSE-based scan/rescan/re-enrich streams.
 * Returns state and trigger functions.
 */
export function useScanStream() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<ScanStreamState>({
    isStreaming: false,
    scanId: null,
    status: null,
    scan: null,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);

  const processStream = useCallback(async (response: Response) => {
    if (!response.ok) {
      const err = await response.json().catch(() => ({ error: 'Request failed' }));
      setState(prev => ({ ...prev, isStreaming: false, error: err.error || 'Request failed' }));
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      setState(prev => ({ ...prev, isStreaming: false, error: 'No response body' }));
      return;
    }

    try {
      for await (const { event, data } of parseSSE(reader)) {
        try {
          const parsed = JSON.parse(data);

          switch (event) {
            case 'created':
              setState(prev => ({ ...prev, scanId: parsed.scanId, status: 'pending' }));
              break;
            case 'status':
              setState(prev => ({ ...prev, status: parsed.status }));
              break;
            case 'complete':
              setState(prev => ({
                ...prev,
                isStreaming: false,
                status: 'complete',
                scan: parsed.scan,
              }));
              // Invalidate caches so list views update
              queryClient.invalidateQueries({ queryKey: queryKeys.scans });
              queryClient.invalidateQueries({ queryKey: queryKeys.usage });
              if (parsed.scan?.id) {
                queryClient.invalidateQueries({ queryKey: queryKeys.scan(parsed.scan.id) });
              }
              break;
            case 'error':
              setState(prev => ({
                ...prev,
                isStreaming: false,
                status: 'error',
                error: parsed.message,
              }));
              break;
          }
        } catch {
          // Skip malformed event data
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setState(prev => ({
          ...prev,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Stream error',
        }));
      }
    }
  }, [queryClient]);

  const startScan = useCallback(async (file: File, modelId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      isStreaming: true,
      scanId: null,
      status: 'pending',
      scan: null,
      error: null,
    });

    const formData = new FormData();
    formData.append('image', file);
    formData.append('modelId', modelId);

    try {
      const response = await fetch('/api/scans', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });
      await processStream(response);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setState(prev => ({
          ...prev,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Failed to start scan',
        }));
      }
    }
  }, [processStream]);

  const startRescan = useCallback(async (scanId: string, modelId?: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      isStreaming: true,
      scanId: null,
      status: 'pending',
      scan: null,
      error: null,
    });

    try {
      const response = await fetch(`/api/scans/${scanId}/rescan`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
        signal: controller.signal,
      });
      await processStream(response);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setState(prev => ({
          ...prev,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Failed to start rescan',
        }));
      }
    }
  }, [processStream]);

  const startReenrich = useCallback(async (scanId: string) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setState({
      isStreaming: true,
      scanId,
      status: 'enriching',
      scan: null,
      error: null,
    });

    try {
      const response = await fetch(`/api/scans/${scanId}/re-enrich`, {
        method: 'POST',
        signal: controller.signal,
      });
      await processStream(response);
    } catch (err) {
      if (!(err instanceof DOMException && err.name === 'AbortError')) {
        setState(prev => ({
          ...prev,
          isStreaming: false,
          error: err instanceof Error ? err.message : 'Failed to start re-enrich',
        }));
      }
    }
  }, [processStream]);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    setState(prev => ({ ...prev, isStreaming: false }));
  }, []);

  return {
    ...state,
    startScan,
    startRescan,
    startReenrich,
    cancel,
  };
}
