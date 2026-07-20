'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useWatchlist } from '@/hooks/useWatchlist';
import { TMDB_IMAGE_BASE } from '@/lib/tmdb';
import RequestButton from './RequestButton';
import type { TmdbMovie } from '@/types';
import type { WatchlistItem } from '@/lib/watchlist';

interface Props {
  item: TmdbMovie;
}

export default function SearchResultCard({ item }: Props) {
  const mediaType = item.mediaType ?? 'movie';
  const { isFavorite, addFavorite, removeFavorite, isWatched, toggleWatched, isSucks, addSucks, removeSucks } =
    useWatchlist();

  const favorited = isFavorite(item.id, mediaType);
  const watched = isWatched(item.id, mediaType);
  const sucks = isSucks(item.id, mediaType);
  const watchItem: WatchlistItem = {
    id: item.id,
    mediaType,
    title: item.title,
    poster_path: item.poster_path,
    release_date: item.release_date ?? '',
    original_language: item.original_language,
    addedAt: Date.now(),
  };

  const year = item.release_date ? new Date(item.release_date).getFullYear() : null;
  const posterUrl = item.poster_path ? `${TMDB_IMAGE_BASE}/w154${item.poster_path}` : null;
  const href = mediaType === 'tv' ? `/tv/${item.id}` : `/documentary/${item.id}`;

  return (
    <div className="flex gap-4 p-3 bg-zinc-900 rounded-lg ring-1 ring-white/5">
      <Link href={href} className="flex-shrink-0">
        <div className="relative w-16 aspect-[2/3] rounded-md overflow-hidden bg-zinc-800">
          {posterUrl ? (
            <Image src={posterUrl} alt={item.title} fill className="object-cover" sizes="64px" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-zinc-600 text-[10px] text-center p-1">
              No Poster
            </div>
          )}
        </div>
      </Link>

      <div className="flex-1 min-w-0">
        <Link href={href} className="font-medium hover:text-amber-400 transition-colors">
          {item.title}
        </Link>
        <p className="text-xs text-zinc-500">
          {mediaType === 'tv' ? 'TV' : 'Movie'}
          {year ? ` · ${year}` : ''}
          {item.vote_average ? ` · ⭐ ${item.vote_average.toFixed(1)}` : ''}
        </p>

        <div className="flex flex-wrap items-start gap-2 mt-2">
          <button
            onClick={() => (favorited ? removeFavorite(item.id, mediaType) : addFavorite(watchItem))}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              favorited ? 'bg-amber-400 text-zinc-950' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {favorited ? '♥ Favorited' : '♡ Favorite'}
          </button>
          <button
            onClick={() => toggleWatched(watchItem)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              watched ? 'bg-green-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {watched ? '✓ Watched' : 'Mark watched'}
          </button>
          <button
            onClick={() => (sucks ? removeSucks(item.id, mediaType) : addSucks(watchItem))}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              sucks ? 'bg-red-600 text-white' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {sucks ? 'Marked sucks' : '👎 Sucks'}
          </button>
          <RequestButton
            id={item.id}
            mediaType={mediaType}
            title={item.title}
            poster_path={item.poster_path}
            release_date={item.release_date ?? ''}
          />
        </div>
      </div>
    </div>
  );
}
