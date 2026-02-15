'use client';

import { useState, useMemo } from 'react';
import { useScans, useDeleteScan } from '@/hooks/use-queries';
import { ScanResults } from '@/components/ScanResults';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Camera, Trash2, ChevronDown, ChevronUp, Search } from 'lucide-react';
import type { ScanStatus, ScanListItem } from '@/types';
import Link from 'next/link';

const statusConfig: Record<ScanStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pending', variant: 'secondary' },
  analyzing: { label: 'Analyzing', variant: 'secondary' },
  enriching: { label: 'Enriching', variant: 'secondary' },
  complete: { label: 'Complete', variant: 'default' },
  error: { label: 'Error', variant: 'destructive' },
};

function timeAgo(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

export function ScanHistory() {
  const { data: scans, isLoading } = useScans();
  const deleteScan = useDeleteScan();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Client-side search filtering (searches across scan model IDs; for title search we'd need a separate endpoint)
  const filteredScans = useMemo(() => {
    if (!scans) return [];
    if (!searchQuery.trim()) return scans;
    const query = searchQuery.toLowerCase();
    return scans.filter((s: ScanListItem) =>
      s.modelId.toLowerCase().includes(query) ||
      s.id.toLowerCase().includes(query)
    );
  }, [scans, searchQuery]);

  function handleDelete(scanId: string) {
    if (!confirm('Delete this scan?')) return;
    deleteScan.mutate(scanId);
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.delete(scanId);
      return next;
    });
  }

  function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Delete ${selectedIds.size} scan(s)?`)) return;
    for (const id of selectedIds) {
      deleteScan.mutate(id);
    }
    setSelectedIds(new Set());
  }

  if (isLoading) return null;

  if ((!scans || scans.length === 0) && !searchQuery) {
    return (
      <div className="text-center py-16">
        <p className="text-muted-foreground mb-4">No scans yet</p>
        <Button asChild>
          <Link href="/">
            <Camera className="h-4 w-4 mr-2" />
            Start Scanning
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search scans..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        {selectedIds.size > 0 && (
          <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
            <Trash2 className="h-4 w-4 mr-1" />
            Delete ({selectedIds.size})
          </Button>
        )}
      </div>

      {filteredScans.length === 0 && searchQuery && (
        <p className="text-center text-sm text-muted-foreground py-8">No matching scans</p>
      )}

      <div className="space-y-2">
        {filteredScans.map((scan: ScanListItem) => {
          const isExpanded = expandedId === scan.id;
          const statusInfo = statusConfig[scan.status as ScanStatus] ?? statusConfig.complete;
          const isSelected = selectedIds.has(scan.id);

          return (
            <div key={scan.id} className="border rounded-lg overflow-hidden">
              <div
                className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                onClick={() => setExpandedId(isExpanded ? null : scan.id)}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={e => {
                    e.stopPropagation();
                    const next = new Set(selectedIds);
                    if (isSelected) next.delete(scan.id);
                    else next.add(scan.id);
                    setSelectedIds(next);
                  }}
                  onClick={e => e.stopPropagation()}
                  className="h-4 w-4"
                />

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium" title={new Date(scan.createdAt).toLocaleString()}>
                      {timeAgo(scan.createdAt)}
                    </span>
                    <Badge variant={statusInfo.variant} className="text-xs">
                      {statusInfo.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    <span>{scan.itemCount} item{scan.itemCount !== 1 ? 's' : ''}</span>
                    {scan.totalCost > 0 && <span>${scan.totalCost.toFixed(4)}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={e => {
                      e.stopPropagation();
                      handleDelete(scan.id);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </div>

              {isExpanded && (
                <div className="border-t p-4">
                  <ScanResults scanId={scan.id} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
