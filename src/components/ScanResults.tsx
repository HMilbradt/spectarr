'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useScan, useUpdateItem } from '@/hooks/use-queries';
import { ExportActions } from '@/components/ExportActions';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Camera, RefreshCw, Pencil, Film, Tv, Disc, Music, Gamepad2, HelpCircle,
  Check, ExternalLink, Star
} from 'lucide-react';
import type { ScanStatus, ScanDetail, ScanItemRow, ItemType, Confidence } from '@/types';
import { cn } from '@/lib/utils';

interface ScanResultsProps {
  scanId: string;
  /** If non-null, an SSE stream is active and this is its current status */
  streamStatus?: ScanStatus | null;
  /** Completed scan data from the stream (available before query cache updates) */
  streamScan?: ScanDetail | null;
}

const typeConfig: Record<ItemType, { label: string; color: string; icon: typeof Film }> = {
  movie: { label: 'Movie', color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', icon: Film },
  tv: { label: 'TV', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: Tv },
  dvd: { label: 'DVD', color: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200', icon: Disc },
  vinyl: { label: 'Vinyl', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200', icon: Music },
  game: { label: 'Game', color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: Gamepad2 },
  other: { label: 'Other', color: 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200', icon: HelpCircle },
};

const confidenceConfig: Record<Confidence, { label: string; dotColor: string }> = {
  high: { label: 'Verified', dotColor: 'bg-green-500' },
  low: { label: 'Partial', dotColor: 'bg-yellow-500' },
  unmatched: { label: 'Unverified', dotColor: 'bg-red-500' },
};

function ScanImagePreview({ scanId }: { scanId: string }) {
  return (
    <div className="rounded-lg overflow-hidden border bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/scans/${scanId}/image`}
        alt="Scanned shelf"
        className="w-full max-h-48 object-contain"
      />
    </div>
  );
}

function RatingDisplay({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-1">
      <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
      <span className="text-xs">{rating.toFixed(1)}</span>
    </div>
  );
}

function ItemRow({ item, onEdit }: { item: ScanItemRow; onEdit: (id: string, title: string, creator: string) => void }) {
  const typeInfo = typeConfig[item.type as ItemType] ?? typeConfig.other;
  const confInfo = confidenceConfig[item.confidence as Confidence] ?? confidenceConfig.unmatched;
  const TypeIcon = typeInfo.icon;

  return (
    <tr className={cn(
      'border-b transition-colors hover:bg-muted/50',
      item.confidence === 'unmatched' && 'bg-amber-50/30 dark:bg-amber-950/10'
    )}>
      {/* Poster */}
      <td className="p-2 w-12">
        <div className="w-10 h-14 rounded bg-muted flex items-center justify-center overflow-hidden flex-shrink-0">
          {item.posterUrl ? (
            <Image
              src={item.posterUrl}
              alt={item.title}
              width={40}
              height={56}
              className="object-cover w-full h-full"
              unoptimized
            />
          ) : (
            <TypeIcon className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </td>

      {/* Title + Creator */}
      <td className="p-2">
        <div className="min-w-0">
          <Tooltip>
            <TooltipTrigger asChild>
              <p className="font-medium text-sm truncate max-w-[200px] lg:max-w-[300px]">
                {item.title}
              </p>
            </TooltipTrigger>
            <TooltipContent side="top" className="max-w-xs">
              <p>{item.title}</p>
              {item.overview && <p className="text-xs mt-1 text-muted-foreground">{item.overview.slice(0, 200)}...</p>}
            </TooltipContent>
          </Tooltip>
          <p className="text-xs text-muted-foreground truncate max-w-[200px]">
            {item.creator || 'Unknown'}
          </p>
        </div>
      </td>

      {/* Type */}
      <td className="p-2 hidden sm:table-cell">
        <Badge variant="secondary" className={cn('text-xs whitespace-nowrap', typeInfo.color)}>
          {typeInfo.label}
        </Badge>
      </td>

      {/* Year */}
      <td className="p-2 hidden sm:table-cell">
        <span className="text-xs text-muted-foreground">{item.year ?? '—'}</span>
      </td>

      {/* Rating */}
      <td className="p-2 hidden md:table-cell">
        {item.rating != null ? <RatingDisplay rating={item.rating} /> : <span className="text-xs text-muted-foreground">—</span>}
      </td>

      {/* Genres */}
      <td className="p-2 hidden lg:table-cell">
        <p className="text-xs text-muted-foreground truncate max-w-[150px]">
          {item.genres ?? '—'}
        </p>
      </td>

      {/* Confidence */}
      <td className="p-2">
        <div className="flex items-center gap-1.5">
          <div className={cn('h-2 w-2 rounded-full flex-shrink-0', confInfo.dotColor)} />
          <span className="text-xs text-muted-foreground hidden sm:inline">{confInfo.label}</span>
        </div>
      </td>

      {/* Plex */}
      <td className="p-2 hidden md:table-cell">
        {item.plexMatch ? (
          <Tooltip>
            <TooltipTrigger>
              <Check className="h-4 w-4 text-green-500" />
            </TooltipTrigger>
            <TooltipContent>In Plex library</TooltipContent>
          </Tooltip>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>

      {/* Links */}
      <td className="p-2 hidden lg:table-cell">
        <div className="flex items-center gap-1">
          {item.tmdbId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={`https://www.themoviedb.org/${item.type === 'tv' ? 'tv' : 'movie'}/${item.tmdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary"
                >
                  <ExternalLink className="h-3 w-3" />
                </a>
              </TooltipTrigger>
              <TooltipContent>View on TMDB</TooltipContent>
            </Tooltip>
          )}
          {item.imdbId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={`https://www.imdb.com/title/${item.imdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary text-xs font-mono"
                >
                  IMDb
                </a>
              </TooltipTrigger>
              <TooltipContent>View on IMDb</TooltipContent>
            </Tooltip>
          )}
          {item.tvdbId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <a
                  href={`https://www.thetvdb.com/dereferrer/${item.type === 'tv' ? 'series' : 'movie'}/${item.tvdbId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-muted-foreground hover:text-primary text-xs font-mono"
                >
                  TVDB
                </a>
              </TooltipTrigger>
              <TooltipContent>View on TheTVDB</TooltipContent>
            </Tooltip>
          )}
        </div>
      </td>

      {/* Edit */}
      <td className="p-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEdit(item.id, item.title, item.creator)}
        >
          <Pencil className="h-3 w-3" />
        </Button>
      </td>
    </tr>
  );
}

export function ScanResults({ scanId, streamStatus, streamScan }: ScanResultsProps) {
  const { data: fetchedScan } = useScan(scanId);
  const updateItem = useUpdateItem(scanId);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editCreator, setEditCreator] = useState('');

  // Prefer stream data if available (fresher), fall back to fetched data
  const scan = streamScan ?? fetchedScan;
  const items = scan?.items;

  // Determine status: streaming status takes priority
  const status: ScanStatus = streamStatus ?? (scan?.status as ScanStatus) ?? 'pending';

  const scanDate = scan?.createdAt ? new Date(scan.createdAt) : new Date();

  function handleEdit(id: string, title: string, creator: string) {
    setEditingId(id);
    setEditTitle(title);
    setEditCreator(creator);
  }

  async function handleRecheck() {
    if (!editingId) return;

    updateItem.mutate(
      { itemId: editingId, title: editTitle, creator: editCreator },
      {
        onSuccess: () => setEditingId(null),
        onError: (error) => {
          console.error('Recheck failed:', error);
        },
      }
    );
  }

  // Loading state
  if (status === 'analyzing' || status === 'enriching' || status === 'pending') {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <RefreshCw className="h-4 w-4 animate-spin" />
          {status === 'analyzing' && 'Analyzing image...'}
          {status === 'enriching' && 'Looking up metadata via TMDB...'}
          {status === 'pending' && 'Starting scan...'}
        </div>
        <div className="space-y-2">
          {Array.from({ length: 4 }, (_, i) => (
            <Skeleton key={i} className="h-14 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (status === 'error') {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-destructive mb-4">Scan failed. Please try again.</p>
        <Button asChild>
          <Link href="/">
            <Camera className="h-4 w-4 mr-2" />
            New Scan
          </Link>
        </Button>
      </div>
    );
  }

  // Empty state
  if (!items || items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground mb-4">No items identified in this image.</p>
        <Button asChild>
          <Link href="/">
            <Camera className="h-4 w-4 mr-2" />
            New Scan
          </Link>
        </Button>
      </div>
    );
  }

  const plexCount = items.filter(i => i.plexMatch).length;

  return (
    <div className="space-y-4">
      {/* Scanned Image Preview */}
      <ScanImagePreview scanId={scanId} />

      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            {items.length} item{items.length !== 1 ? 's' : ''} identified
          </p>
          {plexCount > 0 && (
            <Badge variant="outline" className="text-xs">
              <Check className="h-3 w-3 mr-1" />
              {plexCount} in Plex
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <ExportActions items={items} scanId={scanId} scanDate={scanDate} />
          <Button variant="outline" size="sm" asChild>
            <Link href="/">
              <Camera className="h-4 w-4 mr-1" />
              New Scan
            </Link>
          </Button>
        </div>
      </div>

      {/* Edit inline form */}
      {editingId && (
        <div className="flex gap-2 items-end p-3 bg-muted rounded-lg">
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium">Title</label>
            <Input
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <div className="flex-1 space-y-1">
            <label className="text-xs font-medium">Creator</label>
            <Input
              value={editCreator}
              onChange={e => setEditCreator(e.target.value)}
              className="h-8 text-sm"
            />
          </div>
          <Button size="sm" onClick={handleRecheck} disabled={updateItem.isPending}>
            {updateItem.isPending ? <RefreshCw className="h-3 w-3 animate-spin" /> : 'Re-check'}
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
            Cancel
          </Button>
        </div>
      )}

      {/* Results Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="p-2 w-12"></th>
              <th className="p-2 text-xs font-medium text-muted-foreground">Title</th>
              <th className="p-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Type</th>
              <th className="p-2 text-xs font-medium text-muted-foreground hidden sm:table-cell">Year</th>
              <th className="p-2 text-xs font-medium text-muted-foreground hidden md:table-cell">Rating</th>
              <th className="p-2 text-xs font-medium text-muted-foreground hidden lg:table-cell">Genres</th>
              <th className="p-2 text-xs font-medium text-muted-foreground">Match</th>
              <th className="p-2 text-xs font-medium text-muted-foreground hidden md:table-cell">Plex</th>
              <th className="p-2 text-xs font-medium text-muted-foreground hidden lg:table-cell">Links</th>
              <th className="p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {items.map(item => (
              <ItemRow key={item.id} item={item} onEdit={handleEdit} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
