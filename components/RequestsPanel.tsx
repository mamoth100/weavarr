'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useInfiniteReveal } from '@/hooks/useInfiniteReveal';

interface LedgerRequest {
  id: number;
  tmdbId: number | null;
  mediaType: 'movie' | 'tv';
  title: string;
  posterUrl: string | null;
  source: string;
  seasons: string | null;
  requestedAt: string;
  status: 'downloading' | 'importing' | 'searching' | 'available' | 'partial' | 'fulfilled' | 'removed' | 'unknown';
  percent: number | null;
  detailHref: string | null;
}

const STATUS_STYLE: Record<LedgerRequest['status'], string> = {
  downloading: 'bg-sky-500/15 text-sky-400 ring-sky-500/25',
  importing: 'bg-sky-500/15 text-sky-400 ring-sky-500/25',
  searching: 'bg-amber-500/15 text-amber-400 ring-amber-500/25',
  available: 'bg-green-500/15 text-green-400 ring-green-500/25',
  partial: 'bg-amber-500/15 text-amber-400 ring-amber-500/25',
  fulfilled: 'bg-green-500/10 text-green-300 ring-green-500/20',
  removed: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/25',
  unknown: 'bg-zinc-500/15 text-zinc-500 ring-zinc-500/25',
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'available', label: 'Available' },
  { id: 'removed', label: 'Removed' },
] as const;

type FilterId = (typeof FILTERS)[number]['id'];

function daysSince(iso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000));
}

function statusLabel(r: LedgerRequest): string {
  switch (r.status) {
    case 'downloading': return `Downloading ${r.percent ?? 0}%`;
    case 'importing': return 'Importing…';
    case 'searching': {
      const d = daysSince(r.requestedAt);
      return d >= 1 ? `Searching · day ${d + 1}` : 'Searching';
    }
    case 'available': return 'Available';
    case 'partial': return 'Partially available';
    case 'fulfilled': return 'Downloaded · since deleted';
    case 'removed': return 'Completely Removed';
    default: return 'Unknown';
  }
}

function seasonsLabel(seasons: string | null): string | null {
  if (!seasons) return null;
  try {
    const arr = JSON.parse(seasons);
    if (Array.isArray(arr)) return `Season${arr.length === 1 ? '' : 's'} ${arr.join(', ')}`;
  } catch {
    // not JSON - it's a preset string like "all"
  }
  return seasons === 'all' ? 'All seasons' : seasons;
}

/** The permanent request ledger: everything ever requested through Weavarr (clicks and watchlist auto-adds alike) with its LIVE current status. */
export default function RequestsPanel() {
  const [requests, setRequests] = useState<LedgerRequest[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterId>('all');

  const refresh = useCallback(() => {
    fetch('/api/requests', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setRequests(data.requests ?? []);
        setError(null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const filtered = (requests ?? []).filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'active') return r.status === 'downloading' || r.status === 'importing' || r.status === 'searching';
    if (filter === 'available') return r.status === 'available' || r.status === 'partial' || r.status === 'fulfilled';
    return r.status === 'removed';
  });

  const { visible, sentinelRef } = useInfiniteReveal(filtered.length, filter, 50);

  if (error) return <p className="text-sm text-red-400">Failed to load requests: {error}</p>;

  if (requests === null) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-16 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400">
        Everything requested through Weavarr - taps and watchlist auto-adds alike - kept forever, even after the
        title itself is deleted. Status is live. Recording started when this feature shipped; older requests
        aren&apos;t reconstructable.
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.id ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {requests.length === 0 ? 'Nothing requested yet - the ledger starts now.' : 'No matching requests.'}
        </p>
      ) : (
        <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800/60">
          {filtered.slice(0, visible).map((r) => (
            <div key={r.id} className="p-3 flex items-center gap-3">
              <div className="w-10 aspect-[2/3] rounded bg-zinc-800 overflow-hidden flex-shrink-0">
                {r.posterUrl && (
                  // eslint-disable-next-line @next/next/no-img-element -- poster URLs come from Radarr/Sonarr metadata on arbitrary hosts; next/image would need every host allowlisted
                  <img src={r.posterUrl} alt="" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                {r.detailHref ? (
                  <Link href={r.detailHref} className="text-sm font-medium truncate block hover:text-amber-400 transition-colors">
                    {r.title}
                  </Link>
                ) : (
                  <p className="text-sm font-medium truncate">{r.title}</p>
                )}
                <p className="text-xs text-zinc-500">
                  Requested {new Date(r.requestedAt).toLocaleDateString()}
                  {r.source === 'watchlist' ? ' · via Plex watchlist' : ''}
                  {seasonsLabel(r.seasons) ? ` · ${seasonsLabel(r.seasons)}` : ''}
                </p>
              </div>
              <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${STATUS_STYLE[r.status]}`}>
                {statusLabel(r)}
              </span>
            </div>
          ))}
        </div>
      )}
      <div ref={sentinelRef} />
    </div>
  );
}
