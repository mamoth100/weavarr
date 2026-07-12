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
  const { isWatched } = useWatchlist();
  const searchParams = useSearchParams();
  const showAll = searchParams.get('show') !== 'hide';

  const filtered = showAll
    ? items
    : items.filter((doc) => !isWatched(doc.id, mediaType));

  const hiddenCount = items.length - filtered.length;

  return (
    <>
      {hiddenCount > 0 && (
        <p className="text-xs text-zinc-600 mb-2">
          {hiddenCount} watched item{hiddenCount !== 1 ? 's' : ''} hidden
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
