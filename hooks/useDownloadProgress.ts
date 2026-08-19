'use client';

import { useEffect, useState } from 'react';
import type { DownloadProgressMap } from '@/lib/downloadProgress';

/**
 * Shared download-progress feed for every card/detail page on screen: ONE
 * poller no matter how many components subscribe (same module-level pattern
 * as useLibraryStatus, plus adaptive polling - 12s while something is
 * actually downloading, 60s when the queues are idle so an idle app barely
 * touches Radarr/Sonarr).
 */

const ACTIVE_MS = 12_000;
const IDLE_MS = 60_000;
const BURST_MS = 8_000;

let cache: DownloadProgressMap | null = null;
const subscribers = new Set<(d: DownloadProgressMap) => void>();
let timer: ReturnType<typeof setTimeout> | null = null;
let fetching = false;
// Post-request burst: Radarr/Sonarr take 10-60s to turn a request into a
// queue entry, so right after any add we poll fast until the download shows
// up (or the burst budget runs out) instead of coasting on the idle minute.
let burstLeft = 0;

function hasActivity(d: DownloadProgressMap): boolean {
  return Object.keys(d.movies).length > 0 || Object.keys(d.shows).length > 0;
}

async function poll() {
  if (fetching) return;
  fetching = true;
  try {
    const res = await fetch('/api/download-progress', { cache: 'no-store' });
    const data = await res.json();
    if (!res.ok || data.error) throw new Error(data.error ?? 'failed');
    cache = data;
    if (hasActivity(data)) burstLeft = 0; // found it - normal active cadence takes over
    subscribers.forEach((fn) => fn(data));
  } catch {
    // transient - keep the last snapshot, retry on the next tick
  } finally {
    fetching = false;
    if (burstLeft > 0) burstLeft -= 1;
    if (subscribers.size > 0) {
      timer = setTimeout(poll, burstLeft > 0 ? BURST_MS : cache && hasActivity(cache) ? ACTIVE_MS : IDLE_MS);
    }
  }
}

function subscribe(fn: (d: DownloadProgressMap) => void): () => void {
  subscribers.add(fn);
  if (cache) fn(cache);
  if (subscribers.size === 1 && !fetching) poll();
  return () => {
    subscribers.delete(fn);
    if (subscribers.size === 0 && timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
}

export function useDownloadProgress(): DownloadProgressMap | null {
  const [data, setData] = useState<DownloadProgressMap | null>(cache);
  useEffect(() => subscribe(setData), []);
  return data;
}

/** Nudge the poller right after a request is submitted: fast-poll (8s) for up to ~2 minutes until the grab lands in the queue, so the card lights up as soon as the download actually starts. */
export function refreshDownloadProgressSoon(): void {
  burstLeft = 15;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  setTimeout(poll, 3000);
}
