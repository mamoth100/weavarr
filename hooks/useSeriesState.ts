'use client';

import { useEffect, useState } from 'react';

export interface SeriesState {
  seriesId: number | null;
  monitorFuture: boolean;
  episodes: { seasonNumber: number; episodeNumber: number; hasFile: boolean; title?: string }[];
}

const NOT_ADDED: SeriesState = { seriesId: null, monitorFuture: false, episodes: [] };

// The detail page mounts three readers of the same answer (monitoring chip,
// season row, request modal). One fetch per show per half minute serves all
// of them; a save invalidates so the chip and row refetch together.
const TTL_MS = 30_000;
const cache = new Map<number, { at: number; promise: Promise<SeriesState> }>();
const listeners = new Map<number, Set<() => void>>();

function load(tmdbId: number): Promise<SeriesState> {
  const hit = cache.get(tmdbId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.promise;
  const promise = fetch(`/api/sonarr/series-state?tmdbId=${tmdbId}`, { cache: 'no-store' })
    .then((res) => res.json())
    .then((data) => {
      if (data.error) throw new Error(data.error);
      return data as SeriesState;
    })
    .catch((err) => {
      cache.delete(tmdbId); // let the next reader retry instead of caching a failure
      throw err;
    });
  cache.set(tmdbId, { at: Date.now(), promise });
  return promise;
}

/** Forget what Sonarr had for this show and refetch in every mounted reader. Call after an add, a change of picks, or a delete. */
export function invalidateSeriesState(tmdbId: number): void {
  cache.delete(tmdbId);
  listeners.get(tmdbId)?.forEach((fn) => fn());
}

/**
 * Sonarr's view of one show. Null while loading; a "not added" state when
 * the call fails. `enabled` false holds the fetch off (the modal only asks
 * once it is open).
 */
export function useSeriesState(tmdbId: number, enabled = true): SeriesState | null {
  const [state, setState] = useState<SeriesState | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const bump = () => setTick((t) => t + 1);
    let set = listeners.get(tmdbId);
    if (!set) {
      set = new Set();
      listeners.set(tmdbId, set);
    }
    set.add(bump);
    return () => {
      set!.delete(bump);
    };
  }, [tmdbId]);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    load(tmdbId)
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch(() => {
        if (!cancelled) setState(NOT_ADDED);
      });
    return () => {
      cancelled = true;
    };
  }, [tmdbId, enabled, tick]);

  return state;
}
