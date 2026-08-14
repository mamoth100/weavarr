'use client';

import { useEffect, useState } from 'react';
import SonarrEpisodeManager, { formatBytes } from '@/components/SonarrEpisodeManager';
import SimplePagination from '@/components/SimplePagination';

const PAGE_SIZE = 50;

interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  imdbId: string | null;
  episodeFileCount: number;
  episodeCount: number;
  sizeOnDisk: number;
  status: string;
  posterPath: string | null;
}

function Poster({ id, hasPoster, title }: { id: number; hasPoster: boolean; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!hasPoster || failed) {
    return <div className="w-9 h-[54px] rounded bg-zinc-800 flex-shrink-0" />;
  }
  return (
    <img
      src={`/api/sonarr/image?id=${id}`}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-9 h-[54px] rounded object-cover flex-shrink-0"
    />
  );
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
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/sonarr/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === 'done') {
    return <span className="text-xs font-medium text-green-400">Deleted</span>;
  }

  if (status === 'confirm' || status === 'loading') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">Delete this show?</span>
        <button
          onClick={handleConfirm}
          disabled={status === 'loading'}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-60"
        >
          {status === 'loading' ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setStatus('idle')}
          disabled={status === 'loading'}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setStatus('confirm')}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-red-600 hover:text-white'
        }`}
      >
        {status === 'error' ? 'Failed - retry' : 'Delete'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export default function SonarrLibraryPanel() {
  const [series, setSeries] = useState<SonarrSeries[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch('/api/sonarr/series', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setSeries(data.series);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

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

  const filtered = series
    .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          {filtered.length === series.length
            ? `${series.length} shows in Sonarr`
            : `${filtered.length} of ${series.length} shows`}
          {filtered.length > 0 && ` · showing ${pageStart + 1}-${Math.min(pageStart + PAGE_SIZE, filtered.length)}`}
        </span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
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
                <Poster id={show.id} hasPoster={Boolean(show.posterPath)} title={show.title} />
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
      <SimplePagination page={pageSafe} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
