'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import CardGrid from '@/components/CardGrid';
import SearchResultCard from '@/components/SearchResultCard';
import type { TmdbMovie } from '@/types';

interface Props {
  initialItems: TmdbMovie[];
  initialTotalPages: number;
  totalResults: number;
  /** Serialized filter params (no page) - appended verbatim to /api/browse so pages 2+ see exactly the filters page 1 was rendered with. */
  queryString: string;
  mediaType: 'movie' | 'tv';
  variant: 'default' | 'upcoming';
  mode: 'grid' | 'search';
}

function itemKey(item: TmdbMovie, fallbackType: string): string {
  return `${item.mediaType ?? fallbackType}:${item.id}`;
}

/**
 * Seerr-style infinite scroll: page 1 arrives server-rendered, and a
 * sentinel near the bottom pulls the next page from /api/browse as you
 * approach it. Replaces the numbered pagination bar. De-dupes across pages
 * (TMDB's discover ordering shifts underneath you, so page N+1 can repeat
 * an item from page N).
 */
export default function InfiniteBrowse({
  initialItems,
  initialTotalPages,
  totalResults,
  queryString,
  mediaType,
  variant,
  mode,
}: Props) {
  const [items, setItems] = useState<TmdbMovie[]>(initialItems);
  const [totalPages, setTotalPages] = useState(initialTotalPages);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextPage = useRef(2);
  const seen = useRef<Set<string>>(new Set(initialItems.map((i) => itemKey(i, mediaType))));
  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);

  const done = nextPage.current > totalPages;

  const loadMore = useCallback(async () => {
    if (loadingRef.current || nextPage.current > totalPages) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/browse?${queryString}&page=${nextPage.current}`, { cache: 'no-store' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load more');
      nextPage.current += 1;
      setTotalPages(data.totalPages);
      // De-dupe OUTSIDE the state updater: updaters must be pure - React's
      // StrictMode double-invokes them, and mutating the seen-set inside
      // made the second invocation filter everything out, so the kept
      // result appended nothing (state ping-ponged and never grew).
      const fresh = (data.results as TmdbMovie[]).filter((i) => {
        const key = itemKey(i, mediaType);
        if (seen.current.has(key)) return false;
        seen.current.add(key);
        return true;
      });
      setItems((prev) => [...prev, ...fresh]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }, [queryString, mediaType, totalPages]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      // Start fetching well before the user actually reaches the bottom.
      { rootMargin: '800px 0px' }
    );
    observer.observe(sentinel);

    // Scroll-position fallback: IntersectionObserver callbacks ride on
    // rendering frames, which throttled contexts (background tabs, embedded
    // webviews) never produce - a plain scroll listener plus a geometry
    // check covers those. The immediate check() also auto-fills viewports
    // taller than page 1.
    function check() {
      const s = sentinelRef.current;
      if (!s) return;
      if (s.getBoundingClientRect().top < window.innerHeight + 800) loadMore();
    }
    window.addEventListener('scroll', check, { passive: true });
    window.addEventListener('resize', check);
    check();

    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', check);
      window.removeEventListener('resize', check);
    };
  }, [loadMore]);

  return (
    <>
      {mode === 'search' ? (
        <div className="space-y-3 mt-4">
          {items.map((item) => (
            <SearchResultCard key={itemKey(item, 'movie')} item={item} />
          ))}
        </div>
      ) : (
        <CardGrid items={items} mediaType={mediaType} variant={variant} totalResults={totalResults} />
      )}

      {/* Sentinel + status row. The sentinel stays mounted even while done -
          filters changing remounts this whole component via the key in
          app/page.tsx, so "done" is never stale. */}
      <div ref={sentinelRef} />
      <div className="py-6 text-center text-sm text-zinc-500">
        {error ? (
          <button
            onClick={loadMore}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-red-600 text-white hover:bg-red-500"
          >
            Failed to load more - retry
          </button>
        ) : loading ? (
          <span>Loading more…</span>
        ) : done && items.length > 0 ? (
          <span>That&apos;s everything.</span>
        ) : null}
      </div>
    </>
  );
}
