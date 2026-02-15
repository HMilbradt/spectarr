import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { ScanListItem, ScanDetail, UsageRecordRow, ScanItemRow } from '@/types';

// ─── Query Keys ──────────────────────────────────────────

export const queryKeys = {
  scans: ['scans'] as const,
  scan: (id: string) => ['scans', id] as const,
  usage: ['usage'] as const,
  settings: ['settings'] as const,
};

// ─── Scans ───────────────────────────────────────────────

export function useScans() {
  return useQuery({
    queryKey: queryKeys.scans,
    queryFn: async (): Promise<ScanListItem[]> => {
      const res = await fetch('/api/scans');
      if (!res.ok) throw new Error('Failed to fetch scans');
      const data = await res.json();
      return data.scans;
    },
  });
}

export function useScan(id: string | null) {
  return useQuery({
    queryKey: queryKeys.scan(id!),
    queryFn: async (): Promise<ScanDetail> => {
      const res = await fetch(`/api/scans/${id}`);
      if (!res.ok) throw new Error('Failed to fetch scan');
      return res.json();
    },
    enabled: !!id,
  });
}

export function useDeleteScan() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (scanId: string) => {
      const res = await fetch(`/api/scans/${scanId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete scan');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scans });
    },
  });
}

// ─── Items ───────────────────────────────────────────────

export function useUpdateItem(scanId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ itemId, title, creator }: { itemId: string; title: string; creator: string }): Promise<ScanItemRow> => {
      const res = await fetch(`/api/scans/${scanId}/items/${itemId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, creator }),
      });
      if (!res.ok) throw new Error('Failed to update item');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.scan(scanId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.scans });
    },
  });
}

// ─── Usage ───────────────────────────────────────────────

export function useUsage() {
  return useQuery({
    queryKey: queryKeys.usage,
    queryFn: async (): Promise<UsageRecordRow[]> => {
      const res = await fetch('/api/usage');
      if (!res.ok) throw new Error('Failed to fetch usage');
      const data = await res.json();
      return data.records;
    },
  });
}

// ─── Settings ────────────────────────────────────────────

export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: async (): Promise<Record<string, string>> => {
      const res = await fetch('/api/settings');
      if (!res.ok) throw new Error('Failed to fetch settings');
      const data = await res.json();
      return data.settings;
    },
  });
}

export function useUpdateSetting() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ key, value }: { key: string; value: string }) => {
      const res = await fetch(`/api/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ value }),
      });
      if (!res.ok) throw new Error('Failed to update setting');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}
