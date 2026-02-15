'use client';

import { ScanHistory } from '@/components/ScanHistory';

export default function HistoryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Scan History</h2>
        <p className="text-muted-foreground text-sm mt-1">
          View and manage your previous scans.
        </p>
      </div>

      <ScanHistory />
    </div>
  );
}
