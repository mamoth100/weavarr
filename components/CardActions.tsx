'use client';

import { useWatchlist } from '@/hooks/useWatchlist';
import { flyToTarget } from '@/lib/flyAnimation';
import type { WatchlistItem } from '@/lib/watchlist';

const TMDB_SMALL = 'https://image.tmdb.org/t/p/w92';

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_date: string;
  original_language?: string;
}

export default function CardActions({
  id,
  mediaType,
  title,
  poster_path,
  release_date,
  original_language,
}: Props) {
  const { isFavorite, addFavorite, removeFavorite, isWatched, toggleWatched, isSucks, addSucks, removeSucks } =
    useWatchlist();

  const favorited = isFavorite(id, mediaType);
  const watched = isWatched(id, mediaType);
  const sucks = isSucks(id, mediaType);
  const item: WatchlistItem = { id, mediaType, title, poster_path, release_date, original_language, addedAt: Date.now() };

  function handleFavorite(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (favorited) {
      removeFavorite(id, mediaType);
    } else {
      flyToTarget(e.currentTarget as HTMLElement, 'nav-favorites', poster_path ? `${TMDB_SMALL}${poster_path}` : null);
      addFavorite(item);
    }
  }

  function handleWatched(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isWatched(id, mediaType)) {
      flyToTarget(e.currentTarget as HTMLElement, 'nav-watched', poster_path ? `${TMDB_SMALL}${poster_path}` : null);
    }
    toggleWatched(item);
  }

  function handleSucks(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (sucks) {
      removeSucks(id, mediaType);
    } else {
      flyToTarget(e.currentTarget as HTMLElement, 'nav-sucks', poster_path ? `${TMDB_SMALL}${poster_path}` : null);
      addSucks(item);
    }
  }

  return (
    <>
      {/* Favorite (heart) - top-left. Hover/focus-revealed on desktop; always
          visible with a bigger tap target on touch, where hover doesn't exist. */}
      <button
        onClick={handleFavorite}
        className={`absolute top-2 left-2 z-10 p-1.5 touch:p-2.5 rounded-full transition-all duration-200
          ${
            favorited
              ? 'bg-amber-400 text-zinc-950 opacity-100'
              : 'bg-zinc-900/80 text-white opacity-0 group-hover:opacity-100 focus-visible:opacity-100 touch:opacity-100'
          }`}
        aria-label={favorited ? 'Remove from favorites' : 'Add to favorites'}
      >
        <svg
          className="w-3.5 h-3.5 touch:w-5 touch:h-5"
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
      </button>

      {/* Thumbs down (not interested) - above watched, bottom-left */}
      <button
        onClick={handleSucks}
        className={`absolute bottom-12 touch:bottom-14 left-2 z-10 p-1.5 touch:p-2.5 rounded-full transition-all duration-200
          ${
            sucks
              ? 'bg-red-600/90 text-white opacity-100'
              : 'bg-zinc-900/80 text-zinc-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 touch:opacity-100'
          }`}
        aria-label={sucks ? 'Remove from not interested' : 'Not interested'}
      >
        <svg className="w-3.5 h-3.5 touch:w-5 touch:h-5" fill={sucks ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.105 1.25-1.987 1.25H14.5m0 0l-4.072 1.957a1.5 1.5 0 01-2.181-1.341V16.5M7.5 15V9.75a.75.75 0 01.75-.75h1.5" />
        </svg>
      </button>

      {/* Watched badge - bottom-left */}
      <button
          onClick={handleWatched}
          className={`absolute bottom-2 left-2 z-10 flex items-center gap-1 px-2 py-1 touch:px-2.5 touch:py-2 rounded-md text-xs font-semibold transition-all duration-200
            ${
              watched
                ? 'bg-green-600/90 text-white opacity-100'
                : 'bg-zinc-900/80 text-zinc-400 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 touch:opacity-100'
            }`}
          aria-label={watched ? 'Mark as unwatched' : 'Mark as watched'}
        >
          {watched ? (
            <>
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4.5 12.75l6 6 9-13.5"
                />
              </svg>
              Watched
            </>
          ) : (
            <>
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
                />
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                />
              </svg>
              Mark watched
            </>
          )}
        </button>
    </>
  );
}
