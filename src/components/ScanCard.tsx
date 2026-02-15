'use client';

import Image from 'next/image';
import { Pencil, Star, Film, Tv, Disc, Music, Gamepad2, HelpCircle, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import type { ScanItemRow, ItemType, Confidence } from '@/types';
import { cn } from '@/lib/utils';

interface ScanCardProps {
  item: ScanItemRow;
  onEdit: (id: string, title: string, creator: string) => void;
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
  low: { label: 'Partial Match', dotColor: 'bg-yellow-500' },
  unmatched: { label: 'Unverified', dotColor: 'bg-red-500' },
};

function StarRating({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          className={cn(
            'h-3 w-3',
            i < Math.round(rating / 2)
              ? 'fill-yellow-400 text-yellow-400'
              : 'text-muted-foreground/30'
          )}
        />
      ))}
      <span className="text-xs text-muted-foreground ml-1">{rating.toFixed(1)}</span>
    </div>
  );
}

export function ScanCard({ item, onEdit }: ScanCardProps) {
  const typeInfo = typeConfig[item.type as ItemType];
  const confInfo = confidenceConfig[item.confidence as Confidence];
  const TypeIcon = typeInfo.icon;

  return (
    <Card className={cn(
      'relative overflow-hidden transition-all hover:shadow-md',
      item.confidence === 'unmatched' && 'border-l-4 border-l-amber-400 bg-amber-50/30 dark:bg-amber-950/10'
    )}>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 h-7 w-7 z-10"
        onClick={() => onEdit(item.id, item.title, item.creator)}
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      <CardContent className="p-4">
        <div className="flex gap-3">
          {/* Cover / Placeholder */}
          <div className="flex-shrink-0 w-16 h-24 rounded bg-muted flex items-center justify-center overflow-hidden">
            {item.posterUrl ? (
              <Image
                src={item.posterUrl}
                alt={item.title}
                width={64}
                height={96}
                className="object-cover w-full h-full"
                unoptimized
              />
            ) : (
              <TypeIcon className="h-6 w-6 text-muted-foreground" />
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0 space-y-1.5">
            <Tooltip>
              <TooltipTrigger asChild>
                <h3 className="font-semibold text-sm leading-tight truncate">
                  {item.title}
                </h3>
              </TooltipTrigger>
              <TooltipContent>{item.title}</TooltipContent>
            </Tooltip>

            <p className="text-xs text-muted-foreground truncate">{item.creator || 'Unknown'}</p>

            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className={cn('text-xs', typeInfo.color)}>
                {typeInfo.label}
              </Badge>
              <div className="flex items-center gap-1">
                <div className={cn('h-2 w-2 rounded-full', confInfo.dotColor)} />
                <span className="text-xs text-muted-foreground">{confInfo.label}</span>
              </div>
              {item.plexMatch && (
                <div className="flex items-center gap-1">
                  <Check className="h-3 w-3 text-green-500" />
                  <span className="text-xs text-green-600 dark:text-green-400">Plex</span>
                </div>
              )}
            </div>

            {item.rating != null && <StarRating rating={item.rating} />}

            {item.year && (
              <p className="text-xs text-muted-foreground">{item.year}</p>
            )}

            {item.genres && (
              <p className="text-xs text-muted-foreground/60 truncate">
                {item.genres}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
