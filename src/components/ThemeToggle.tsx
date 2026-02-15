'use client';

import { useSyncExternalStore, useCallback } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

function getThemeSnapshot(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  const stored = localStorage.getItem('theme');
  if (stored === 'dark' || stored === 'light') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function getServerSnapshot(): 'light' | 'dark' {
  return 'light';
}

function subscribe(callback: () => void): () => void {
  // Listen for storage changes (cross-tab)
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getThemeSnapshot, getServerSnapshot);

  // Sync document class with theme
  if (typeof document !== 'undefined') {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }

  const toggle = useCallback(() => {
    const next = theme === 'light' ? 'dark' : 'light';
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark', next === 'dark');
    // Trigger re-render via storage event workaround
    window.dispatchEvent(new StorageEvent('storage', { key: 'theme', newValue: next }));
  }, [theme]);

  return (
    <Button variant="ghost" size="sm" onClick={toggle} className="gap-2">
      {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      <span className="text-sm">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
    </Button>
  );
}
