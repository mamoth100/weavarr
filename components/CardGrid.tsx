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
}

export default function CardGrid({ items, mediaType, variant = 'default' }: Props) {
  const { loaded, watchedItems, sucksItems } = useWatchlist();
  const searchParams = useSearchParams();
  const isSearching = !!searchParams.get('q');
  const hideWatched = !isSearching && searchParams.get('show') !== 'all';
  const showSucks = isSearching || searchParams.get('sucks') === 'show';

  // Snapshot the watched/sucks sets ONCE after initial Supabase load so that
  // marking items during this session doesn't immediately remove them from view.
  const [snapshotWatched, setSnapshotWatched] = useState<Set<string>>(new Set());
  const [snapshotSucks, setSnapshotSucks] = useState<Set<string>>(new Set());
  const snapped = useRef(false);

  useEffect(() => {
    if (loaded && !snapped.current) {
      snapped.current = true;
      setSnapshotWatched(new Set(watchedItems.map((i) => `${i.id}:${i.mediaType}`)));
      setSnapshotSucks(new Set(sucksItems.map((i) => `${i.id}:${i.mediaType}`)));
    }
  }, [loaded, watchedItems, sucksItems]);

  const filtered = items.filter((doc) => {
    const key = `${doc.id}:${mediaType}`;
    if (hideWatched && snapshotWatched.has(key)) return false;
    if (!showSucks && snapshotSucks.has(key)) return false;
    return true;
  }).slice(0, 20);

  const hiddenWatchedCount = hideWatched ? items.filter((d) => snapshotWatched.has(`${d.id}:${mediaType}`)).length : 0;
  const hiddenSucksCount = !showSucks ? items.filter((d) => snapshotSucks.has(`${d.id}:${mediaType}`)).length : 0;

  // Wait until Supabase has loaded before rendering so the filter is
  // applied on the very first paint — no flash of unfiltered items.
  if (!snapped.current && !loaded) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="aspect-[2/3] bg-zinc-800 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <>
      {(hiddenWatchedCount > 0 || hiddenSucksCount > 0) && (
        <p className="text-xs text-zinc-600 mb-2">
          {[
            hiddenWatchedCount > 0 && `${hiddenWatchedCount} watched hidden`,
            hiddenSucksCount > 0 && `${hiddenSucksCount} sucks hidden`,
          ].filter(Boolean).join(' · ')}
        </p>
      )}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        {filtered.map((doc) => (
          <DocCard key={doc.id} doc={doc} mediaType={mediaType} variant={variant} />
        ))}
      </div>
    </>
  );
}
