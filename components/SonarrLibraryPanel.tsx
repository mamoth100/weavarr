'use client';

import { useEffect, useState } from 'react';

interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  imdbId: string | null;
  episodeFileCount: number;
  episodeCount: number;
  sizeOnDisk: number;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '—';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
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
    return <span className="text-xs font-medium text-green-400">Deleted ✓</span>;
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
        {status === 'error' ? 'Failed — retry' : 'Delete'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export default function SonarrLibraryPanel() {
  const [series, setSeries] = useState<SonarrSeries[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>{series.length} shows in Sonarr</span>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title…"
          className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
        />
      </div>
      <div className="space-y-2">
        {filtered.map((show) => (
          <div key={show.id} className="flex items-center justify-between bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
            <div>
              <p className="text-sm font-medium">{show.title} {show.year ? `(${show.year})` : ''}</p>
              <p className="text-xs text-zinc-500">
                {show.episodeFileCount > 0
                  ? `${show.episodeFileCount}/${show.episodeCount} episodes · ${formatBytes(show.sizeOnDisk)}`
                  : 'No files'}
              </p>
            </div>
            <DeleteButton seriesId={show.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
