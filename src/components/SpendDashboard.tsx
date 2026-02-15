'use client';

import { useState, useMemo } from 'react';
import { useUsage } from '@/hooks/use-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DollarSign } from 'lucide-react';
import type { UsageRecordRow } from '@/types';

type DateRange = 'week' | 'month' | 'all';

function getCutoff(range: DateRange): number {
  if (range === 'week') return Date.now() - 7 * 86400000;
  if (range === 'month') return Date.now() - 30 * 86400000;
  return 0;
}

function filterByRange(records: UsageRecordRow[], range: DateRange): UsageRecordRow[] {
  if (range === 'all') return records;
  const cutoff = getCutoff(range);
  return records.filter((r) => r.createdAt >= cutoff);
}

export function SpendDashboard() {
  const { data: records, isLoading } = useUsage();
  const [range, setRange] = useState<DateRange>('all');

  const data = useMemo(() => {
    if (!records) return null;

    const filtered = filterByRange(records, range);

    const totalCost = filtered.reduce((sum: number, r: UsageRecordRow) => sum + r.costUsd, 0);

    // Per-model breakdown
    const modelMap = new Map<string, { scans: number; cost: number }>();
    for (const r of filtered) {
      const existing = modelMap.get(r.model) ?? { scans: 0, cost: 0 };
      existing.scans += 1;
      existing.cost += r.costUsd;
      modelMap.set(r.model, existing);
    }

    const modelBreakdown = Array.from(modelMap.entries()).map(([model, stats]) => ({
      model,
      ...stats,
    }));

    // Recent records (already sorted desc from API)
    const recent = filtered.slice(0, 20);

    return { totalCost, modelBreakdown, recent };
  }, [records, range]);

  if (isLoading || !data) return null;

  return (
    <div className="space-y-6">
      {/* Total spend */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">Total Spend</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <DollarSign className="h-8 w-8 text-primary" />
            <span className="text-3xl font-bold">${data.totalCost.toFixed(4)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Date range filter */}
      <div className="flex gap-2">
        {(['week', 'month', 'all'] as DateRange[]).map(r => (
          <Button
            key={r}
            variant={range === r ? 'default' : 'outline'}
            size="sm"
            onClick={() => setRange(r)}
          >
            {r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : 'All Time'}
          </Button>
        ))}
      </div>

      {/* Per-model breakdown */}
      {data.modelBreakdown.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">By Model</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {data.modelBreakdown.map(m => (
                <div key={m.model} className="flex items-center justify-between text-sm">
                  <span className="font-mono text-xs">{m.model}</span>
                  <div className="flex items-center gap-4">
                    <span className="text-muted-foreground">{m.scans} scan{m.scans !== 1 ? 's' : ''}</span>
                    <span className="font-medium">${m.cost.toFixed(4)}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent usage table */}
      {data.recent.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Scans</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 font-medium text-muted-foreground">Date</th>
                    <th className="pb-2 font-medium text-muted-foreground">Model</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">In</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Out</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((r: UsageRecordRow) => (
                    <tr key={r.id} className="border-b last:border-0">
                      <td className="py-2 text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                      <td className="py-2 text-xs font-mono">{r.model.split('/').pop()}</td>
                      <td className="py-2 text-xs text-right">{r.inputTokens.toLocaleString()}</td>
                      <td className="py-2 text-xs text-right">{r.outputTokens.toLocaleString()}</td>
                      <td className="py-2 text-xs text-right font-medium">${r.costUsd.toFixed(4)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {data.recent.length === 0 && (
        <p className="text-center text-sm text-muted-foreground py-8">No usage data yet</p>
      )}
    </div>
  );
}
