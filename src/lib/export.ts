import type { ScanItemRow } from '@/types';

// ─── CSV Export ──────────────────────────────────────────

function escapeCsvField(value: string | null | undefined): string {
  if (value == null) return '';
  const str = String(value).replace(/\n/g, ' ');
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function exportToCsv(items: ScanItemRow[], scanId: string): Blob {
  const headers = [
    'title', 'creator', 'type', 'year', 'rating', 'genres', 'releaseDate',
    'tmdbId', 'imdbId', 'tvdbId', 'confidence', 'source', 'plexMatch',
    'director', 'runtime', 'network', 'seasons', 'showStatus'
  ];
  const rows = items.map(item => [
    escapeCsvField(item.title),
    escapeCsvField(item.creator),
    escapeCsvField(item.type),
    escapeCsvField(item.year != null ? String(item.year) : null),
    escapeCsvField(item.rating != null ? String(item.rating) : null),
    escapeCsvField(item.genres),
    escapeCsvField(item.releaseDate),
    escapeCsvField(item.tmdbId != null ? String(item.tmdbId) : null),
    escapeCsvField(item.imdbId),
    escapeCsvField(item.tvdbId != null ? String(item.tvdbId) : null),
    escapeCsvField(item.confidence),
    escapeCsvField(item.source),
    escapeCsvField(item.plexMatch ? 'Yes' : 'No'),
    escapeCsvField(item.director),
    escapeCsvField(item.runtime != null ? String(item.runtime) : null),
    escapeCsvField(item.network),
    escapeCsvField(item.seasons != null ? String(item.seasons) : null),
    escapeCsvField(item.showStatus),
  ].join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  // UTF-8 BOM for Excel compatibility
  const bom = '\uFEFF';
  return new Blob([bom + csv], { type: 'text/csv;charset=utf-8' });
}

// ─── JSON Export ─────────────────────────────────────────

export function exportToJson(items: ScanItemRow[], scanId: string, scanDate: Date): Blob {
  const data = {
    exportDate: new Date().toISOString(),
    scanId,
    scanDate: scanDate.toISOString(),
    itemCount: items.length,
    items: items.map(item => ({
      title: item.title,
      creator: item.creator,
      type: item.type,
      year: item.year,
      rating: item.rating,
      genres: item.genres,
      releaseDate: item.releaseDate,
      tmdbId: item.tmdbId,
      imdbId: item.imdbId,
      tvdbId: item.tvdbId,
      confidence: item.confidence,
      source: item.source,
      posterUrl: item.posterUrl,
      overview: item.overview,
      director: item.director,
      runtime: item.runtime,
      network: item.network,
      seasons: item.seasons,
      showStatus: item.showStatus,
      plexMatch: item.plexMatch,
      plexRatingKey: item.plexRatingKey,
    })),
  };

  return new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
}

// ─── Download Helper ─────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function getExportFilename(scanId: string, extension: string): string {
  const date = new Date().toISOString().slice(0, 10);
  return `spectarr-${scanId.slice(0, 8)}-${date}.${extension}`;
}
