'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

const GENRES = [
  { value: 'documentary', label: 'Documentaries' },
  { value: 'reality', label: 'Reality TV' },
  { value: 'upcoming', label: 'Coming Soon' },
  { value: 'search', label: 'Search' },
];

const VISIBLE_LINKS = [
  { href: '/status', label: 'Status' },
  { href: '/ready-to-watch', label: 'Ready to Watch' },
];

const ADMIN_LINKS = [
  { href: '/radarr-library', label: 'Movies (Radarr)' },
  { href: '/sonarr-library', label: 'TV (Sonarr)' },
];

export default function GenreSwitcher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('genre') ?? 'documentary';
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [menuOpen]);

  return (
    <div className="flex items-center gap-1 p-1 bg-zinc-900 rounded-xl border border-zinc-800 max-w-full">
      <div className="flex flex-wrap gap-1 flex-1 min-w-0">
        {GENRES.map((g) => (
          <button
            key={g.value}
            onClick={() => router.push(`/?genre=${g.value}`)}
            className={`px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap ${
              current === g.value
                ? 'bg-amber-400 text-zinc-950'
                : 'text-zinc-400 hover:text-white'
            }`}
          >
            {g.label}
          </button>
        ))}
        {VISIBLE_LINKS.map((link) => (
          <button
            key={link.href}
            onClick={() => router.push(link.href)}
            className="px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 whitespace-nowrap text-zinc-400 hover:text-white"
          >
            {link.label}
          </button>
        ))}
      </div>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setMenuOpen((o) => !o)}
          aria-label="More pages"
          className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
            menuOpen ? 'bg-zinc-800 text-white' : 'text-zinc-400 hover:text-white'
          }`}
        >
          More
        </button>
        {menuOpen && (
          <div className="absolute right-0 mt-1 z-20 min-w-[190px] bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl py-1">
            {ADMIN_LINKS.map((link) => (
              <button
                key={link.href}
                onClick={() => {
                  setMenuOpen(false);
                  router.push(link.href);
                }}
                className="w-full text-left px-3.5 py-2 text-sm font-medium text-zinc-300 hover:bg-zinc-800 hover:text-white transition-colors whitespace-nowrap"
              >
                {link.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
