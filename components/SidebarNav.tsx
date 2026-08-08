'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { MenuConfig } from '@/lib/settings';

interface NavItem {
  key: string;
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function itemClass(active: boolean) {
  return `block w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
    active ? 'bg-amber-400 text-zinc-950' : 'text-zinc-400 hover:text-white hover:bg-zinc-800'
  }`;
}

export default function SidebarNav({ config }: { config: MenuConfig }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const onDashboard = pathname === '/';
  const current = searchParams.get('genre') ?? config.genres[0]?.id ?? 'all';
  const [mobileOpen, setMobileOpen] = useState(false);

  // A route change (clicking any nav item) always means the drawer should
  // close on mobile - simplest way to catch every case, tab or link alike.
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, searchParams]);

  const items: NavItem[] = [
    ...config.genres.map((g) => ({
      key: `genre:${g.id}`,
      label: g.label,
      isActive: onDashboard && current === g.id,
      onClick: () => router.push(`/?genre=${g.id}`),
    })),
    ...config.links.map((l) =>
      l.kind === 'tab'
        ? {
            key: `tab:${l.id}`,
            label: l.label,
            isActive: onDashboard && current === l.id,
            onClick: () => router.push(`/?genre=${l.id}`),
          }
        : {
            key: `link:${l.id}`,
            label: l.label,
            isActive: pathname === l.href,
            onClick: () => router.push(l.href!),
          }
    ),
  ];

  return (
    <>
      {/* Mobile trigger - fixed top-left, only below the lg breakpoint where the sidebar itself is off-canvas. */}
      <button
        onClick={() => setMobileOpen(true)}
        aria-label="Open menu"
        className="lg:hidden fixed top-4 left-4 z-30 p-2 rounded-lg bg-zinc-900 border border-zinc-800 text-zinc-300 hover:text-white"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
        </svg>
      </button>

      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 flex-shrink-0 bg-zinc-900 border-r border-zinc-800 flex flex-col transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="px-4 py-5 border-b border-zinc-800 flex items-center justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight hover:text-amber-400 transition">
            Weav<span className="text-amber-400">arr</span>
          </Link>
          <button
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
            className="lg:hidden p-1 text-zinc-500 hover:text-white"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {items.map((item) => (
            <button key={item.key} onClick={item.onClick} className={itemClass(item.isActive)}>
              {item.label}
            </button>
          ))}
        </nav>
      </aside>
    </>
  );
}
