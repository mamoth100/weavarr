'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Poster, formatBytes } from '@/components/RecentlyWatchedSection';
import ConfirmButton from '@/components/ConfirmButton';
import { useInfiniteReveal } from '@/hooks/useInfiniteReveal';

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

function DeleteButton({ movieId }: { movieId: number }) {
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
        const res = await fetch('/api/radarr/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movieId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      }}
    />
  );
}

export default function RadarrLibraryPanel() {
  const [movies, setMovies] = useState<RadarrMovie[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetch('/api/radarr/movies', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setMovies(data.movies);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Memoized: this ran in the render body before, re-sorting the entire
  // library with localeCompare on every keystroke and unrelated re-render.
  // Sort ignores leading articles, matching the TV panel.
  const filtered = useMemo(
    () => {
      const sortKey = (t: string) => t.replace(/^(the|a|an)\s+/i, '');
      return (movies ?? [])
        .filter((m) => m.title.toLowerCase().includes(query.toLowerCase()))
        .sort((a, b) => sortKey(a.title).localeCompare(sortKey(b.title)));
    },
    [movies, query]
  );

  // Must sit above the early returns - hooks can't be conditional.
  const { visible, sentinelRef } = useInfiniteReveal(filtered.length, query, PAGE_SIZE);

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


  const paged = filtered.slice(0, visible);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>
          {filtered.length === movies.length
            ? `${movies.length} movies in Radarr`
            : `${filtered.length} of ${movies.length} movies`}
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
        {paged.map((movie) => (
          <div key={movie.id} className="flex items-center justify-between bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
            <Link href={`/documentary/${movie.tmdbId}`} className="flex items-center gap-3 min-w-0 group">
              <Poster id={movie.id} hasPoster={Boolean(movie.posterPath)} title={movie.title} service="radarr" />
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
      <div ref={sentinelRef} />
    </div>
  );
}
