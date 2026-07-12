'use client';

import { useWatchlist } from '@/hooks/useWatchlist';
import type { WatchlistItem } from '@/lib/watchlist';

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_date: string;
}

export default function DetailActions({ id, mediaType, title, poster_path, release_date }: Props) {
  const { isFavorite, addFavorite, removeFavorite, isWatched, toggleWatched } =
    useWatchlist();

  const favorited = isFavorite(id, mediaType);
  const watched = isWatched(id, mediaType);

  const item: WatchlistItem = { id, mediaType, title, poster_path, release_date, addedAt: Date.now() };

  return (
    <div className="flex items-center gap-2 mt-4">
      {/* Favorite */}
      <button
        onClick={() => favorited ? removeFavorite(id, mediaType) : addFavorite(item)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
          ${favorited
            ? 'bg-amber-400 text-zinc-950 hover:bg-amber-300'
            : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
      >
        <svg
          className="w-4 h-4"
          fill={favorited ? 'currentColor' : 'none'}
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z"
          />
        </svg>
        {favorited ? 'Favorited' : 'Favorite'}
      </button>

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
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          strokeWidth={watched ? '2.5' : '2'}
          viewBox="0 0 24 24"
        >
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
    </div>
  );
}
