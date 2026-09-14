'use client';

import { useEffect, useState } from 'react';

export type Availability = 'available' | 'partial' | 'requested';

export interface LibraryStatus {
  movies: Record<number, Availability>;
  shows: Record<number, Availability>;
}

// One fetch per page load shared by every card on screen - a browse grid
// renders 20 DocCards at once, and each fetching its own copy of the full
// library map would be 20x the same request. Module scope survives card
// mounts; null until loaded (cards just render no badge meanwhile).
let cached: LibraryStatus | null = null;
let inflight: Promise<LibraryStatus | null> | null = null;
const listeners = new Set<(s: LibraryStatus) => void>();

function load(): Promise<LibraryStatus | null> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = fetch('/api/library-status', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        cached = { movies: data.movies ?? {}, shows: data.shows ?? {} };
        return cached;
      })
      .catch(() => {
        inflight = null; // allow a retry on the next mount
        return null;
      });
  }
  return inflight;
}

/**
 * Drops the shared snapshot and refetches for every mounted card. Called
 * after any request or delete: module scope outlives client-side
 * navigation, so without this a title requested on one page still showed a
 * Request pill on the next, and a deleted one kept its "In library" badge
 * until a hard reload.
 */
export function invalidateLibraryStatus(): void {
  cached = null;
  inflight = null;
  if (listeners.size === 0) return;
  load().then((s) => {
    if (s) listeners.forEach((fn) => fn(s));
  });
}

export function useLibraryStatus(): LibraryStatus | null {
  const [status, setStatus] = useState<LibraryStatus | null>(cached);

  useEffect(() => {
    let cancelled = false;
    listeners.add(setStatus);
    if (!cached) {
      load().then((s) => {
        if (!cancelled && s) setStatus(s);
      });
    } else {
      setStatus(cached);
    }
    return () => {
      cancelled = true;
      listeners.delete(setStatus);
    };
  }, []);

  return status;
}
