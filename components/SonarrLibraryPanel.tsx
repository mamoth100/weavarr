'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import SonarrEpisodeManager from '@/components/SonarrEpisodeManager';
import { Poster, formatBytes } from '@/components/RecentlyWatchedSection';
import ConfirmButton from '@/components/ConfirmButton';
import { useInfiniteReveal } from '@/hooks/useInfiniteReveal';

const PAGE_SIZE = 50;

interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  imdbId: string | null;
  tmdbId: number | null;
  episodeFileCount: number;
  episodeCount: number;
  sizeOnDisk: number;
  status: string;
  posterPath: string | null;
}

const STATUS_STYLES: Record<string, { label: string; className: string }> = {
  continuing: { label: 'Continuing', className: 'bg-green-500/15 text-green-400 ring-green-500/25' },
  upcoming: { label: 'Upcoming', className: 'bg-sky-500/15 text-sky-400 ring-sky-500/25' },
  ended: { label: 'Ended', className: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/25' },
  deleted: { label: 'Deleted', className: 'bg-red-500/15 text-red-400 ring-red-500/25' },
};

function StatusBadge({ status }: { status: string }) {
  const style = STATUS_STYLES[status] ?? {
    label: status ? status.charAt(0).toUpperCase() + status.slice(1) : 'Unknown',
    className: 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/25',
  };
  return (
    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${style.className}`}>
      {style.label}
    </span>
  );
}

function DeleteButton({ seriesId }: { seriesId: number }) {
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-xs font-medium text-green-400">Deleted</span>;
  }

  return (
    <ConfirmButton
      label="Delete"
      confirmLabel="Really delete?"
      busyLabel="Deleting…"
      onSuccess={() => setDone(true)}
      action={async () => {
        const res = await fetch('/api/sonarr/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seriesId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      }}
    />
  );
}

export default function SonarrLibraryPanel() {
  const [series, setSeries] = useState<SonarrSeries[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/sonarr/series', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setSeries(data.series);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Memoized: this ran in the render body before, re-sorting the entire
  // library with localeCompare on every keystroke and unrelated re-render.
  // Sort ignores leading articles like Sonarr's own sortTitle - "The 1%
  // Club" belongs near the top with the numbers, not buried in the T's.
  const filtered = useMemo(
    () => {
      const sortKey = (t: string) => t.replace(/^(the|a|an)\s+/i, '');
      return (series ?? [])
        .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title)));
    },
    [series, query]
  );

  // Must sit above the early returns - hooks can't be conditional.
  const { visible, sentinelRef } = useInfiniteReveal(filtered.length, query, PAGE_SIZE);

  if (error) {
    return <p className="text-red-400 text-sm">Failed to load Sonarr library: {error}</p>;
  }

  if (!series) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }


  const paged = filtered.slice(0, visible);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          {filtered.length === series.length
            ? `${series.length} shows in Sonarr`
            : `${filtered.length} of ${series.length} shows`}
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title…"
          className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-500"
        />
      </div>
      <div className="space-y-2">
        {paged.map((show) => (
          <div key={show.id} className="bg-zinc-900 rounded-lg ring-1 ring-white/5 overflow-hidden">
            <div className="flex items-center justify-between p-3">
              <button
                onClick={() => setExpanded((prev) => (prev === show.id ? null : show.id))}
                className="flex items-center gap-3 text-left min-w-0"
              >
                <span className={`text-zinc-500 text-xs transition-transform ${expanded === show.id ? 'rotate-90' : ''}`}>▶</span>
                <Poster id={show.id} hasPoster={Boolean(show.posterPath)} title={show.title} service="sonarr" />
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{show.title} {show.year ? `(${show.year})` : ''}</p>
                  <p className="text-xs text-zinc-500">
                    {show.episodeFileCount > 0
                      ? `${show.episodeFileCount}/${show.episodeCount} episodes · ${formatBytes(show.sizeOnDisk)}`
                      : 'No files'}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-3 shrink-0">
                {/* Tapping the title expands episodes (load-bearing) - detail-page navigation gets its own link instead. */}
                {show.tmdbId && (
                  <Link
                    href={`/tv/${show.tmdbId}`}
                    className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
                  >
                    Details
                  </Link>
                )}
                <StatusBadge status={show.status} />
                <DeleteButton seriesId={show.id} />
              </div>
            </div>
            {expanded === show.id && (
              <div className="px-3 pb-3">
                <SonarrEpisodeManager seriesId={show.id} />
              </div>
            )}
          </div>
        ))}
      </div>
      <div ref={sentinelRef} />
    </div>
  );
}
