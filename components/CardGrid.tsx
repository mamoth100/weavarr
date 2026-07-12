'use client';

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
  const { isWatched, isSucks } = useWatchlist();
  const searchParams = useSearchParams();
  const hideWatched = searchParams.get('show') !== 'all';
  const showSucks = searchParams.get('sucks') === 'show';

  const filtered = items.filter((doc) => {
    if (hideWatched && isWatched(doc.id, mediaType)) return false;
    if (!showSucks && isSucks(doc.id, mediaType)) return false;
    return true;
  });

  const hiddenWatchedCount = hideWatched ? items.filter((doc) => isWatched(doc.id, mediaType)).length : 0;
  const hiddenSucksCount = !showSucks ? items.filter((doc) => isSucks(doc.id, mediaType)).length : 0;

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
