'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import SimplePagination from '@/components/SimplePagination';

const PAGE_SIZE = 50;

interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  hasFile: boolean;
  sizeOnDisk: number;
  tmdbId: number;
  posterPath: string | null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '-';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function Poster({ id, hasPoster, title }: { id: number; hasPoster: boolean; title: string }) {
  const [failed, setFailed] = useState(false);
  if (!hasPoster || failed) {
    return <div className="w-9 h-[54px] rounded bg-zinc-800 flex-shrink-0" />;
  }
  return (
    <img
      src={`/api/radarr/image?id=${id}`}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-9 h-[54px] rounded object-cover flex-shrink-0"
    />
  );
}

function DeleteButton({ movieId }: { movieId: number }) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/radarr/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movieId }),
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
        <span className="text-xs text-zinc-400">Delete this movie?</span>
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

export default function RadarrLibraryPanel() {
  const [movies, setMovies] = useState<RadarrMovie[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch('/api/radarr/movies', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setMovies(data.movies);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return <p className="text-red-400 text-sm">Failed to load Radarr library: {error}</p>;
  }

  if (!movies) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const filtered = movies
    .filter((m) => m.title.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => a.title.localeCompare(b.title));

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageSafe = Math.min(page, totalPages);
  const pageStart = (pageSafe - 1) * PAGE_SIZE;
  const paged = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          {filtered.length === movies.length
            ? `${movies.length} movies in Radarr`
            : `${filtered.length} of ${movies.length} movies`}
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
        {paged.map((movie) => (
          <div key={movie.id} className="flex items-center justify-between bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
            <Link href={`/documentary/${movie.tmdbId}`} className="flex items-center gap-3 min-w-0 group">
              <Poster id={movie.id} hasPoster={Boolean(movie.posterPath)} title={movie.title} />
              <div className="min-w-0">
                <p className="text-sm font-medium truncate group-hover:text-amber-400 transition-colors">
                  {movie.title} {movie.year ? `(${movie.year})` : ''}
                </p>
                <p className="text-xs text-zinc-500">
                  {movie.hasFile ? formatBytes(movie.sizeOnDisk) : 'No file'}
                </p>
              </div>
            </Link>
            <DeleteButton movieId={movie.id} />
          </div>
        ))}
      </div>
      <SimplePagination page={pageSafe} totalPages={totalPages} onChange={setPage} />
    </div>
  );
}
