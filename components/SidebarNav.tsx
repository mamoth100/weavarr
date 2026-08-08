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

const UTILITY_LINKS = [
  {
    href: '/favorites',
    label: 'Favorites',
    icon: 'M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z',
  },
  {
    href: '/watched',
    label: 'Watched',
    icon: 'M4.5 12.75l6 6 9-13.5',
  },
  {
    href: '/sucks',
    label: 'Sucks',
    icon: 'M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.105 1.25-1.987 1.25H14.5m0 0l-4.072 1.957a1.5 1.5 0 01-2.181-1.341V16.5M7.5 15V9.75a.75.75 0 01.75-.75h1.5',
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: 'M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z',
    icon2: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z',
  },
];

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
        <nav className="p-2 space-y-0.5 border-t border-zinc-800">
          {UTILITY_LINKS.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 ${itemClass(active)}`}
              >
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d={link.icon} />
                  {link.icon2 && <path strokeLinecap="round" strokeLinejoin="round" d={link.icon2} />}
                </svg>
                {link.label}
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
