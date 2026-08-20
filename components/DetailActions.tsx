'use client';

import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useWatchlist } from '@/hooks/useWatchlist';
import type { WatchlistItem } from '@/lib/watchlist';

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_date: string;
  children?: ReactNode;
}

export default function DetailActions({ id, mediaType, title, poster_path, release_date, children }: Props) {
  const router = useRouter();
  const { isWatched, toggleWatched, isSucks, addSucks, removeSucks } = useWatchlist();

  const watched = isWatched(id, mediaType);
  const sucks = isSucks(id, mediaType);

  const item: WatchlistItem = { id, mediaType, title, poster_path, release_date, addedAt: Date.now() };

  return (
    <div className="flex flex-wrap items-start gap-2 mt-4">
      {/* Watched */}
      <button
        onClick={() => toggleWatched(item)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
          ${watched
            ? 'bg-green-600 text-white hover:bg-green-500'
            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        aria-label={watched ? 'Mark as unwatched' : 'Mark as watched'}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={watched ? '2.5' : '2'} viewBox="0 0 24 24">
          {watched ? (
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          ) : (
            <>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </>
          )}
        </svg>
        {watched ? 'Watched' : 'Mark watched'}
      </button>

      {/* Sucks */}
      <button
        onClick={() => {
          if (sucks) { removeSucks(id, mediaType); } else { addSucks(item); router.back(); }
        }}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
          ${sucks
            ? 'bg-red-600 text-white hover:bg-red-500'
            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        aria-label={sucks ? 'Remove from not interested' : 'Not interested'}
      >
        <svg className="w-4 h-4" fill={sucks ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.105 1.25-1.987 1.25H14.5m0 0l-4.072 1.957a1.5 1.5 0 01-2.181-1.341V16.5M7.5 15V9.75a.75.75 0 01.75-.75h1.5" />
        </svg>
        {sucks ? 'Not interested ✓' : 'Not interested'}
      </button>

      {children}
    </div>
  );
}
