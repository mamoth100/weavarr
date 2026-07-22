'use client';

import { useRouter, useSearchParams } from 'next/navigation';

const GENRES = [
  { value: 'documentary', label: 'Documentaries', emoji: '🎬' },
  { value: 'reality', label: 'Reality TV', emoji: '📺' },
  { value: 'upcoming', label: 'Coming Soon', emoji: '🔜' },
  { value: 'search', label: 'Search', emoji: '🔍' },
];

const EXTRA_LINKS = [
  { href: '/status', label: 'Status', emoji: '📡' },
  { href: '/radarr-library', label: 'Movies (Radarr)', emoji: '🎬' },
  { href: '/sonarr-library', label: 'TV (Sonarr)', emoji: '📺' },
];

export default function GenreSwitcher() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const current = searchParams.get('genre') ?? 'documentary';

  return (
    <div className="flex flex-wrap gap-1 p-1 bg-zinc-900 rounded-xl border border-zinc-800 max-w-full">
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
          {g.emoji} {g.label}
        </button>
      ))}
      {EXTRA_LINKS.map((link) => (
        <button
          key={link.href}
          onClick={() => router.push(link.href)}
          className="px-3 sm:px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-zinc-400 hover:text-white whitespace-nowrap"
        >
          {link.emoji} {link.label}
        </button>
      ))}
    </div>
  );
}
