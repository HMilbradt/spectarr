'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Camera, Clock, Settings } from 'lucide-react';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Logo } from '@/components/Logo';
import { cn } from '@/lib/utils';

const navItems = [
  { href: '/', label: 'Scan', icon: Camera },
  { href: '/history', label: 'History', icon: Clock },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex fixed left-0 top-0 h-full w-56 flex-col border-r bg-card p-4 z-40">
        <div className="mb-8">
          <div className="flex items-center gap-2">
            <Logo />
            <h1 className="text-xl font-bold">Spectarr</h1>
          </div>
          <p className="text-xs text-muted-foreground">Identify your media</p>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto pt-4 border-t">
          <ThemeToggle />
        </div>
      </aside>

      {/* Mobile bottom tab bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 border-t bg-card z-40">
        <div className="flex items-center justify-around h-16">
          {navItems.map(item => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex flex-col items-center gap-1 px-3 py-2 text-xs transition-colors',
                  isActive
                    ? 'text-primary'
                    : 'text-muted-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {isActive && <span>{item.label}</span>}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
