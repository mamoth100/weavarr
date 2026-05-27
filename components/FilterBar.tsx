'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { SUBGENRES, SORT_OPTIONS, DECADES } from '@/lib/subgenres';
import type { SortOption } from '@/types';

interface Props {
  activeSubgenres: string[];
  currentSort: SortOption;
  currentDecade: string;
  currentQuery: string;
}

export default function FilterBar({
  activeSubgenres,
  currentSort,
  currentDecade,
  currentQuery,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentQuery);

  function navigate(updates: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val === undefined || val === '') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });
    params.delete('page');
    router.push(`?${params.toString()}`);
  }

  function handleSearchKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') {
      navigate({ q: searchInput.trim() || undefined });
    }
  }

  function clearSearch() {
    setSearchInput('');
    navigate({ q: undefined });
  }

  function toggleSubgenre(id: string) {
    const next = activeSubgenres.includes(id)
      ? activeSubgenres.filter((s) => s !== id)
      : [...activeSubgenres, id];
    navigate({ subgenres: next.length ? next.join(',') : undefined });
  }

  const isSearching = !!currentQuery;
  const genre = searchParams.get('genre') ?? 'documentary';
  const isUpcoming = genre === 'upcoming';

  if (isUpcoming) {
    return (
      <p className="text-xs text-zinc-600 py-2">Sorted by release date · next 6 months · documentaries only</p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="relative">
        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500">🔍</span>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleSearchKey}
          placeholder="Search documentaries… press Enter"
          className="w-full bg-zinc-800 text-white text-sm rounded-lg pl-9 pr-10 py-2.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
        />
        {searchInput && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white transition"
          >
            ✕
          </button>
        )}
      </div>

      {isSearching ? (
        <p className="text-xs text-zinc-500">
          Showing results for <span className="text-amber-400">&ldquo;{currentQuery}&rdquo;</span>
          {' — '}
          <button onClick={clearSearch} className="underline hover:text-white transition">
            clear search
          </button>
        </p>
      ) : (
        <>
          {/* Sort pills */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1">Sort</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => navigate({ sort: opt.value })}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  currentSort === opt.value
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {opt.emoji} {opt.label}
              </button>
            ))}
          </div>

          {/* Decade filter */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1">Era</span>
            {DECADES.map((d) => (
              <button
                key={d.value}
                onClick={() => navigate({ decade: d.value || undefined })}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  currentDecade === d.value
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Subgenre chips — documentary only */}
          {(searchParams.get('genre') ?? 'documentary') === 'documentary' && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1">Genre</span>
            <button
              onClick={() => navigate({ subgenres: undefined })}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeSubgenres.length === 0
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              All
            </button>
            {SUBGENRES.map((sg) => (
              <button
                key={sg.id}
                onClick={() => toggleSubgenre(sg.id)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  activeSubgenres.includes(sg.id)
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {sg.emoji} {sg.label}
              </button>
            ))}
          </div>
          )}
        </>
      )}
    </div>
  );
}
