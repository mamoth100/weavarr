'use client';

import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useWatchlist } from '@/hooks/useWatchlist';
import DocCard from './DocCard';
import type { TmdbMovie } from '@/types';

interface Props {
  items: TmdbMovie[];
  mediaType: 'movie' | 'tv';
  variant?: 'default' | 'upcoming';
  /** Total result count from the server page - rendered here so count + hidden-breakdown make one line instead of two stacked micro-rows. */
  totalResults?: number;
  /** Suppress the results/hidden info line - for Discover's section slices, where four of them would be noise. */
  quiet?: boolean;
  /** Cap the grid at N cards AFTER watched/sucks filtering - slicing before
      filtering left visible holes whenever a hidden item was in the slice. */
  maxItems?: number;
}

export default function CardGrid({ items, mediaType, variant = 'default', totalResults, quiet = false, maxItems }: Props) {
  const { loaded, watchedItems, sucksItems, favorites } = useWatchlist();
  const searchParams = useSearchParams();
  const isSearching = !!searchParams.get('q');
  const hideWatched = !isSearching && searchParams.get('show') !== 'all';
  const showSucks = isSearching || searchParams.get('sucks') === 'show';
  const showFav = isSearching || searchParams.get('fav') === 'show';

  // Snapshot the watched/sucks sets ONCE after the initial watchlist load so that
  // marking items during this session doesn't immediately remove them from view.
  const [snapshotWatched, setSnapshotWatched] = useState<Set<string>>(new Set());
  const [snapshotSucks, setSnapshotSucks] = useState<Set<string>>(new Set());
  const [snapshotFavorites, setSnapshotFavorites] = useState<Set<string>>(new Set());
  const snapped = useRef(false);

  useEffect(() => {
    if (loaded && !snapped.current) {
      snapped.current = true;
      setSnapshotWatched(new Set(watchedItems.map((i) => `${i.id}:${i.mediaType}`)));
      setSnapshotSucks(new Set(sucksItems.map((i) => `${i.id}:${i.mediaType}`)));
      setSnapshotFavorites(new Set(favorites.map((i) => `${i.id}:${i.mediaType}`)));
    }
  }, [loaded, watchedItems, sucksItems, favorites]);

  // Keep sucks snapshot live so items disappear immediately when thumbs-downed
  useEffect(() => {
    if (snapped.current) {
      setSnapshotSucks(new Set(sucksItems.map((i) => `${i.id}:${i.mediaType}`)));
    }
  }, [sucksItems]);

  // Keep watched snapshot live so items disappear immediately when marked watched
  useEffect(() => {
    if (snapped.current) {
      setSnapshotWatched(new Set(watchedItems.map((i) => `${i.id}:${i.mediaType}`)));
    }
  }, [watchedItems]);

  // Keep favorites snapshot live
  useEffect(() => {
    if (snapped.current) {
      setSnapshotFavorites(new Set(favorites.map((i) => `${i.id}:${i.mediaType}`)));
    }
  }, [favorites]);

  // No display cap - the grid grows as InfiniteBrowse appends pages. (The
  // old .slice(0, 20) cap is what forced the server to over-fetch two TMDB
  // pages per pagination step.)
  const unfiltered = items.filter((doc) => {
    const key = `${doc.id}:${doc.mediaType ?? mediaType}`;
    if (hideWatched && snapshotWatched.has(key)) return false;
    if (!showSucks && snapshotSucks.has(key)) return false;
    if (!showFav && snapshotFavorites.has(key)) return false;
    return true;
  });
  const filtered = maxItems ? unfiltered.slice(0, maxItems) : unfiltered;

  const hiddenWatchedCount = hideWatched ? items.filter((d) => snapshotWatched.has(`${d.id}:${d.mediaType ?? mediaType}`)).length : 0;
  const hiddenSucksCount = !showSucks ? items.filter((d) => snapshotSucks.has(`${d.id}:${d.mediaType ?? mediaType}`)).length : 0;
  const hiddenFavCount = !showFav ? items.filter((d) => snapshotFavorites.has(`${d.id}:${d.mediaType ?? mediaType}`)).length : 0;

  // Wait until the watchlist has loaded before rendering so the filter is
  // applied on the very first paint - no flash of unfiltered items.
  if (!snapped.current && !loaded) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: Math.min(maxItems ?? 20, 20) }).map((_, i) => (
          <div key={i} className="aspect-[2/3] bg-zinc-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const infoLine = [
    totalResults !== undefined && `${totalResults.toLocaleString()} results`,
    hiddenWatchedCount > 0 && `${hiddenWatchedCount} watched hidden`,
    hiddenSucksCount > 0 && `${hiddenSucksCount} not interested hidden`,
    hiddenFavCount > 0 && `${hiddenFavCount} favorites hidden`,
  ].filter(Boolean).join(' · ');

  return (
    <>
      {infoLine && !quiet && <p className="text-xs text-zinc-500 mt-4 mb-2">{infoLine}</p>}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map((doc) => (
          <DocCard key={`${doc.id}:${doc.mediaType ?? mediaType}`} doc={doc} mediaType={doc.mediaType ?? mediaType} variant={variant} />
        ))}
      </div>
    </>
  );
}
