'use client';

import { useEffect, useState } from 'react';

// One fetch per page load shared by every grid on it; the value only changes
// through Settings > Menu, which reloads the page on save.
let cached: Set<number> | null = null;
let inflight: Promise<Set<number>> | null = null;

function load(): Promise<Set<number>> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch('/api/menu', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        cached = new Set<number>(Array.isArray(data.hiddenGenreIds) ? data.hiddenGenreIds : []);
        return cached;
      })
      .catch(() => new Set<number>())
      .finally(() => {
        inflight = null;
      });
  }
  return inflight;
}

/** TMDB genre ids the user never wants to see in a grid. Empty until loaded, so nothing flashes hidden then shown. */
export function useHiddenGenres(): Set<number> {
  const [ids, setIds] = useState<Set<number>>(() => cached ?? new Set());
  useEffect(() => {
    let cancelled = false;
    load().then((s) => {
      if (!cancelled) setIds(s);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ids;
}
