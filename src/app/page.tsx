'use client';

import { useState, useCallback, useEffect } from 'react';
import { toast } from 'sonner';
import { useScanStream } from '@/hooks/use-scan-stream';
import { useSettings } from '@/hooks/use-queries';
import { DEFAULT_MODEL_ID } from '@/lib/constants';
import { ImageCapture } from '@/components/ImageCapture';
import { ScanResults } from '@/components/ScanResults';

interface ServiceConfig {
  openrouter: { configured: boolean; baseUrl: string };
  tmdb: { configured: boolean };
  tvdb: { configured: boolean };
  plex: { configured: boolean; url: string | null };
}

export default function HomePage() {
  const [services, setServices] = useState<ServiceConfig | null>(null);
  const { data: settings } = useSettings();
  const stream = useScanStream();

  useEffect(() => {
    fetch('/api/config')
      .then(res => res.json())
      .then(data => setServices(data.services))
      .catch(() => {});
  }, []);

  // Show error toast when stream errors
  useEffect(() => {
    if (stream.error) {
      toast.error('Scan failed', { description: stream.error });
    }
  }, [stream.error]);

  // Show success toast when scan completes
  useEffect(() => {
    if (stream.scan) {
      toast.success(`Found ${stream.scan.items.length} item(s)`);
    }
  }, [stream.scan]);

  const handleScanStart = useCallback(async (file: File) => {
    if (services && !services.openrouter.configured) {
      toast.error('OpenRouter not configured', {
        description: 'The server does not have an OpenRouter API key configured. Contact your administrator.',
        action: { label: 'Settings', onClick: () => window.location.href = '/settings' },
      });
      return;
    }

    if (services && !services.tmdb.configured) {
      toast.error('TMDB not configured', {
        description: 'The server does not have a TMDB API key configured. Contact your administrator.',
        action: { label: 'Settings', onClick: () => window.location.href = '/settings' },
      });
      return;
    }

    const modelId = settings?.default_model ?? DEFAULT_MODEL_ID;
    stream.startScan(file, modelId);
  }, [services, settings, stream]);

  // Determine which scan to show results for
  const activeScanId = stream.scanId;
  const activeScan = stream.scan;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Scan Shelf</h2>
        <p className="text-muted-foreground text-sm mt-1">
          Upload a photo of your shelf to identify movies, TV shows, vinyl, and games.
        </p>
      </div>

      <ImageCapture onScanStart={handleScanStart} isUploading={stream.isStreaming} />

      {(activeScanId || activeScan) && (
        <ScanResults
          scanId={activeScan?.id ?? activeScanId!}
          streamStatus={stream.isStreaming ? stream.status : null}
          streamScan={activeScan}
        />
      )}
    </div>
  );
}
