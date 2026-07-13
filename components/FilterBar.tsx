'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, useEffect } from 'react';
import { SUBGENRES, SORT_OPTIONS, DECADES, STREAMING_PROVIDERS } from '@/lib/subgenres';
import type { SortOption } from '@/types';

interface Props {
  activeSubgenres: string[];
  currentSort: SortOption;
  currentDecade: string;
  currentQuery: string;
  currentLang: string;
  currentYear: string;
}

export default function FilterBar({
  activeSubgenres,
  currentSort,
  currentDecade,
  currentQuery,
  currentLang,
  currentYear,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentQuery);
  const [yearInput, setYearInput] = useState(currentYear);
  const [isPending, startTransition] = useTransition();
  const [pendingFilter, setPendingFilter] = useState<string | null>(null);

  useEffect(() => {
    if (!isPending) setPendingFilter(null);
  }, [isPending]);

  function navigate(updates: Record<string, string | undefined>, filterId?: string) {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(updates).forEach(([key, val]) => {
      if (val === undefined || val === '') {
        params.delete(key);
      } else {
        params.set(key, val);
      }
    });
    params.delete('page');
    if (filterId) setPendingFilter(filterId);
    startTransition(() => {
      router.push(`?${params.toString()}`);
    });
  }

  function pendingClass(filterId: string) {
    return pendingFilter === filterId
      ? 'ring-2 ring-amber-400 animate-pulse'
      : '';
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
    navigate({ subgenres: next.length ? next.join(',') : undefined }, `subgenre-${id}`);
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
          {/* Watched + Sucks + Language — all on one line */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1">Watched</span>
            <button
              onClick={() => navigate({ show: undefined }, 'show-hide')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass('show-hide')} ${
                searchParams.get('show') !== 'all'
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              Hide watched
            </button>
            <button
              onClick={() => navigate({ show: 'all' }, 'show-all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass('show-all')} ${
                searchParams.get('show') === 'all'
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              Show all
            </button>

            <span className="text-xs text-zinc-500 uppercase tracking-wider mx-1">Language</span>
            <button
              onClick={() => navigate({ lang: undefined }, 'lang-en')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass('lang-en')} ${
                currentLang !== 'all'
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              🇬🇧 English only
            </button>
            <button
              onClick={() => navigate({ lang: 'all' }, 'lang-all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass('lang-all')} ${
                currentLang === 'all'
                  ? 'bg-amber-500 text-black'
                  : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
              }`}
            >
              🌍 All languages
            </button>
          </div>

          {/* Sort pills + sucks/favorites toggles */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1">Sort</span>
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => navigate({ sort: opt.value }, `sort-${opt.value}`)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass(`sort-${opt.value}`)} ${
                  currentSort === opt.value
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {opt.emoji} {opt.label}
              </button>
            ))}
            {/* Sucks + Favorites icon toggles — right side */}
            <div className="ml-auto flex gap-2">
              <button
                onClick={() => navigate({ sucks: searchParams.get('sucks') === 'show' ? undefined : 'show' }, 'icon-sucks')}
                title={searchParams.get('sucks') === 'show' ? 'Hide sucks' : 'Show sucks'}
                className={`p-2 rounded-full transition-all duration-200 ${pendingClass('icon-sucks')} ${
                  searchParams.get('sucks') === 'show'
                    ? 'bg-red-600/90 text-white'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
                aria-label="Toggle sucks visibility"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.105 1.25-1.987 1.25H14.5m0 0l-4.072 1.957a1.5 1.5 0 01-2.181-1.341V16.5M7.5 15V9.75a.75.75 0 01.75-.75h1.5" />
                </svg>
              </button>
              <button
                onClick={() => navigate({ fav: searchParams.get('fav') === 'show' ? undefined : 'show' }, 'icon-fav')}
                title={searchParams.get('fav') === 'show' ? 'Hide favorites' : 'Show favorites'}
                className={`p-2 rounded-full transition-all duration-200 ${pendingClass('icon-fav')} ${
                  searchParams.get('fav') === 'show'
                    ? 'bg-amber-400 text-zinc-950'
                    : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                }`}
                aria-label="Toggle favorites visibility"
              >
                <svg className="w-4 h-4" fill={searchParams.get('fav') === 'show' ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
              </button>
            </div>
          </div>

          {/* Era + specific year */}
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1">Era</span>
            {DECADES.map((d) => (
              <button
                key={d.value}
                onClick={() => navigate({ decade: d.value || undefined, year: undefined }, `decade-${d.value || 'all'}`)}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass(`decade-${d.value || 'all'}`)} ${
                  currentDecade === d.value && !currentYear
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                {d.label}
              </button>
            ))}
            <div className="relative flex items-center">
              <input
                type="text"
                inputMode="numeric"
                maxLength={4}
                value={yearInput}
                onChange={(e) => setYearInput(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const y = yearInput.trim();
                    navigate({ year: y.length === 4 ? y : undefined, decade: undefined });
                  }
                  if (e.key === 'Escape') {
                    setYearInput('');
                    navigate({ year: undefined });
                  }
                }}
                placeholder="Year"
                className={`w-20 bg-zinc-800 text-white text-sm rounded-full px-3 py-1.5 border transition-colors focus:outline-none placeholder:text-zinc-600 ${
                  currentYear
                    ? 'border-amber-500 text-amber-400'
                    : 'border-zinc-700 focus:border-amber-500'
                }`}
              />
              {currentYear && (
                <button
                  onClick={() => { setYearInput(''); navigate({ year: undefined }); }}
                  className="absolute right-2 text-zinc-500 hover:text-white transition"
                >
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Subgenre chips — documentary only */}
          {(searchParams.get('genre') ?? 'documentary') === 'documentary' && (
          <div className="flex gap-2 flex-wrap items-center">
            <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1">Genre</span>
            <button
              onClick={() => navigate({ subgenres: undefined }, 'subgenre-all')}
              className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass('subgenre-all')} ${
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
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass(`subgenre-${sg.id}`)} ${
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
