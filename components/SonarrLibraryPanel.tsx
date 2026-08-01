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

interface SonarrEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  hasFile: boolean;
  sizeOnDisk: number;
  airDateUtc: string | null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '-';
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

function DeleteEpisodeButton({
  seriesId,
  seasonNumber,
  episodeNumber,
  onDeleted,
}: {
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  onDeleted: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/sonarr/delete-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId, seasonNumber, episodeNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setStatus('done');
      onDeleted();
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
        <button
          onClick={handleConfirm}
          disabled={status === 'loading'}
          className="px-2 py-0.5 rounded text-xs font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-60"
        >
          {status === 'loading' ? 'Deleting…' : 'Confirm'}
        </button>
        <button
          onClick={() => setStatus('idle')}
          disabled={status === 'loading'}
          className="px-2 py-0.5 rounded text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
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
        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-400 hover:bg-red-600 hover:text-white'
        }`}
      >
        {status === 'error' ? 'Failed - retry' : 'Delete'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function SearchEpisodeButton({ episodeId }: { episodeId: number }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/sonarr/search-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === 'done') {
    return <span className="text-xs font-medium text-green-400">Searching…</span>;
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={status === 'loading'}
        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-60 ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-400 hover:bg-amber-500 hover:text-black'
        }`}
      >
        {status === 'loading' ? 'Searching…' : status === 'error' ? 'Failed - retry' : 'Download'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function EpisodeList({ seriesId }: { seriesId: number }) {
  const [episodes, setEpisodes] = useState<SonarrEpisode[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`/api/sonarr/episodes?seriesId=${seriesId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setEpisodes(data.episodes);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [seriesId]);

  function markDeleted(episodeId: number) {
    setEpisodes((prev) => prev?.map((e) => (e.id === episodeId ? { ...e, hasFile: false, sizeOnDisk: 0 } : e)) ?? null);
  }

  if (error) return <p className="text-xs text-red-400 px-3 pb-3">Failed to load episodes: {error}</p>;
  if (!episodes) {
    return (
      <div className="px-3 pb-3 space-y-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-zinc-800/60 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  const seasons = Array.from(new Set(episodes.map((e) => e.seasonNumber))).sort((a, b) => a - b);

  return (
    <div className="px-3 pb-3 space-y-3">
      {seasons.map((seasonNumber) => (
        <div key={seasonNumber}>
          <p className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-1">
            {seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`}
          </p>
          <div className="space-y-1">
            {episodes
              .filter((e) => e.seasonNumber === seasonNumber)
              .map((e) => (
                <div key={e.id} className="flex items-center justify-between bg-zinc-800/40 rounded px-2.5 py-1.5">
                  <p className="text-xs text-zinc-300 truncate pr-2">
                    <span className="text-zinc-500">
                      S{String(e.seasonNumber).padStart(2, '0')}E{String(e.episodeNumber).padStart(2, '0')}
                    </span>{' '}
                    {e.title}
                  </p>
                  {e.hasFile ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-zinc-600">{formatBytes(e.sizeOnDisk)}</span>
                      <DeleteEpisodeButton
                        seriesId={seriesId}
                        seasonNumber={e.seasonNumber}
                        episodeNumber={e.episodeNumber}
                        onDeleted={() => markDeleted(e.id)}
                      />
                    </div>
                  ) : e.airDateUtc && new Date(e.airDateUtc).getTime() <= Date.now() ? (
                    <SearchEpisodeButton episodeId={e.id} />
                  ) : (
                    <span className="text-xs text-zinc-700 flex-shrink-0">{e.airDateUtc ? 'Not aired yet' : 'TBA'}</span>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}
    </div>
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
          <div key={show.id} className="bg-zinc-900 rounded-lg ring-1 ring-white/5 overflow-hidden">
            <div className="flex items-center justify-between p-3">
              <button
                onClick={() => setExpanded((prev) => (prev === show.id ? null : show.id))}
                className="flex items-center gap-2 text-left min-w-0"
              >
                <span className={`text-zinc-500 text-xs transition-transform ${expanded === show.id ? 'rotate-90' : ''}`}>▶</span>
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{show.title} {show.year ? `(${show.year})` : ''}</p>
                  <p className="text-xs text-zinc-500">
                    {show.episodeFileCount > 0
                      ? `${show.episodeFileCount}/${show.episodeCount} episodes · ${formatBytes(show.sizeOnDisk)}`
                      : 'No files'}
                  </p>
                </div>
              </button>
              <DeleteButton seriesId={show.id} />
            </div>
            {expanded === show.id && <EpisodeList seriesId={show.id} />}
          </div>
        ))}
      </div>
    </div>
  );
}
