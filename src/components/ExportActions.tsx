'use client';

import { Button } from '@/components/ui/button';
import { Download, FileJson } from 'lucide-react';
import { exportToCsv, exportToJson, downloadBlob, getExportFilename } from '@/lib/export';
import type { ScanItemRow } from '@/types';

interface ExportActionsProps {
  items: ScanItemRow[];
  scanId: string;
  scanDate: Date;
}

export function ExportActions({ items, scanId, scanDate }: ExportActionsProps) {
  function handleCsvExport() {
    const blob = exportToCsv(items, scanId);
    downloadBlob(blob, getExportFilename(scanId, 'csv'));
  }

  function handleJsonExport() {
    const blob = exportToJson(items, scanId, scanDate);
    downloadBlob(blob, getExportFilename(scanId, 'json'));
  }

  return (
    <div className="flex gap-2">
      <Button variant="outline" size="sm" onClick={handleCsvExport} disabled={items.length === 0}>
        <Download className="h-4 w-4 mr-1" />
        CSV
      </Button>
      <Button variant="outline" size="sm" onClick={handleJsonExport} disabled={items.length === 0}>
        <FileJson className="h-4 w-4 mr-1" />
        JSON
      </Button>
    </div>
  );
}
