'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useTransition, useEffect, useRef } from 'react';
import { SUBGENRES, SORT_OPTIONS, DECADES, STREAMING_PROVIDERS } from '@/lib/subgenres';
import type { SortOption } from '@/types';

interface Props {
  activeSubgenres: string[];
  currentSort: SortOption;
  currentDecade: string;
  currentQuery: string;
  currentLang: string;
  currentYear: string;
  defaultGenreId: string;
}

export default function FilterBar({
  activeSubgenres,
  currentSort,
  currentDecade,
  currentQuery,
  currentLang,
  currentYear,
  defaultGenreId,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [searchInput, setSearchInput] = useState(currentQuery);
  const [yearInput, setYearInput] = useState(currentYear);
  const [isPending, startTransition] = useTransition();
  const [pendingFilter, setPendingFilter] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isPending) setPendingFilter(null);
  }, [isPending]);

  useEffect(() => {
    if (!filtersOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setFiltersOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [filtersOpen]);

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

  function resetAllFilters() {
    setYearInput('');
    navigate({
      show: undefined,
      sucks: undefined,
      fav: undefined,
      lang: undefined,
      sort: undefined,
      decade: undefined,
      year: undefined,
      subgenres: undefined,
    });
  }

  const isSearching = !!currentQuery;
  const genre = searchParams.get('genre') ?? defaultGenreId;
  const isUpcoming = genre === 'upcoming';
  const isGlobalSearch = genre === 'search';
  const isDocumentaryGenre = genre === 'documentary';

  if (isUpcoming) {
    return (
      <p className="text-xs text-zinc-600 py-2">Sorted by release date · next 6 months · documentaries only</p>
    );
  }

  // ---- Active-filter chips (only ones that differ from the default) ----
  const showAll = searchParams.get('show') === 'all';
  const sucksOn = searchParams.get('sucks') === 'show';
  const favOn = searchParams.get('fav') === 'show';
  const langAll = currentLang === 'all';
  const sortOpt = SORT_OPTIONS.find((o) => o.value === currentSort);
  const sortIsDefault = currentSort === 'vote_average.desc';
  const eraLabel = currentYear ? `Year ${currentYear}` : DECADES.find((d) => d.value === currentDecade && d.value)?.label;

  const chips: { key: string; label: string; onClear: () => void }[] = [];
  if (showAll) chips.push({ key: 'show', label: 'Watched', onClear: () => navigate({ show: undefined }, 'show-all') });
  if (sucksOn) chips.push({ key: 'sucks', label: 'Sucks', onClear: () => navigate({ sucks: undefined }, 'icon-sucks-row1') });
  if (favOn) chips.push({ key: 'fav', label: 'Favorites', onClear: () => navigate({ fav: undefined }, 'icon-fav-row1') });
  if (langAll) chips.push({ key: 'lang', label: 'All languages', onClear: () => navigate({ lang: undefined }, 'lang-en') });
  if (!sortIsDefault && sortOpt) chips.push({ key: 'sort', label: sortOpt.label, onClear: () => navigate({ sort: undefined }) });
  if (eraLabel) chips.push({ key: 'era', label: eraLabel, onClear: () => { setYearInput(''); navigate({ decade: undefined, year: undefined }); } });
  if (isDocumentaryGenre) {
    SUBGENRES.filter((sg) => activeSubgenres.includes(sg.id)).forEach((sg) =>
      chips.push({ key: `sg-${sg.id}`, label: sg.label, onClear: () => toggleSubgenre(sg.id) })
    );
  }

  return (
    <div className="space-y-3">
      {/* Search bar */}
      <div className="relative">
        <input
          type="text"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          onKeyDown={handleSearchKey}
          placeholder={isGlobalSearch ? 'Search anything… press Enter' : 'Search documentaries… press Enter'}
          className="w-full bg-zinc-800 text-white text-sm rounded-lg pl-3 pr-14 py-2.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
        />
        {searchInput && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-500 hover:text-white transition"
          >
            Clear
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
      ) : isGlobalSearch ? (
        <p className="text-xs text-zinc-600 py-2">Search across everything — any movie or show, any genre.</p>
      ) : (
        <div className="relative" ref={panelRef}>
          {/* Filters trigger + active chips */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setFiltersOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                filtersOpen ? 'bg-zinc-700 text-white' : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
              }`}
            >
              Filters
              {chips.length > 0 && (
                <span className="bg-amber-500 text-black rounded-full text-xs font-bold px-1.5 leading-4">
                  {chips.length}
                </span>
              )}
            </button>
            {chips.map((chip) => (
              <button
                key={chip.key}
                onClick={chip.onClear}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
              >
                {chip.label}
              </button>
            ))}
            {chips.length > 0 && (
              <button
                onClick={resetAllFilters}
                className="text-sm font-medium text-zinc-500 hover:text-white underline underline-offset-2 transition-colors"
              >
                Reset all
              </button>
            )}
          </div>

          {/* Mobile scrim */}
          {filtersOpen && (
            <div
              className="md:hidden fixed inset-0 bg-black/60 z-40"
              onClick={() => setFiltersOpen(false)}
            />
          )}

          {/* Filters panel: dropdown on desktop, bottom sheet on mobile */}
          <div
            className={`
              ${filtersOpen ? 'flex' : 'hidden'}
              flex-col gap-5 z-50 bg-zinc-900 border-zinc-800
              fixed inset-x-0 bottom-0 rounded-t-2xl border-t p-4 max-h-[78vh]
              md:absolute md:inset-x-auto md:bottom-auto md:top-full md:left-0 md:mt-2
              md:w-[560px] md:max-w-[90vw] md:rounded-xl md:border md:p-5 md:max-h-[70vh]
              overflow-y-auto
            `}
          >
            <div className="md:hidden w-10 h-1 rounded-full bg-zinc-700 mx-auto -mt-1" />

            {/* Include + Language */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1 w-full sm:w-auto">Include</span>
              <button
                onClick={() => navigate({ show: searchParams.get('show') === 'all' ? undefined : 'all' }, 'show-all')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass('show-all')} ${
                  searchParams.get('show') === 'all'
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Watched
              </button>
              <button
                onClick={() => navigate({ sucks: searchParams.get('sucks') === 'show' ? undefined : 'show' }, 'icon-sucks-row1')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass('icon-sucks-row1')} ${
                  searchParams.get('sucks') === 'show'
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Sucks
              </button>
              <button
                onClick={() => navigate({ fav: searchParams.get('fav') === 'show' ? undefined : 'show' }, 'icon-fav-row1')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass('icon-fav-row1')} ${
                  searchParams.get('fav') === 'show'
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                Favorites
              </button>

              <span className="text-xs text-zinc-500 uppercase tracking-wider mx-1 w-full sm:w-auto mt-2 sm:mt-0">Language</span>
              <button
                onClick={() => navigate({ lang: undefined }, 'lang-en')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass('lang-en')} ${
                  currentLang !== 'all'
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                English only
              </button>
              <button
                onClick={() => navigate({ lang: 'all' }, 'lang-all')}
                className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${pendingClass('lang-all')} ${
                  currentLang === 'all'
                    ? 'bg-amber-500 text-black'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                }`}
              >
                All languages
              </button>
            </div>

            {/* Sort pills */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1 w-full sm:w-auto">Sort</span>
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
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Era + specific year */}
            <div className="flex gap-2 flex-wrap items-center">
              <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1 w-full sm:w-auto">Era</span>
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
                    className="absolute right-2 text-xs font-medium text-zinc-500 hover:text-white transition"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            {/* Subgenre chips — documentary only */}
            {isDocumentaryGenre && (
              <div className="flex gap-2 flex-wrap items-center">
                <span className="text-xs text-zinc-500 uppercase tracking-wider mr-1 w-full sm:w-auto">Genre</span>
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
                    {sg.label}
                  </button>
                ))}
              </div>
            )}

            <div className="md:hidden pt-1">
              <button
                onClick={() => setFiltersOpen(false)}
                className="w-full py-2.5 rounded-lg bg-amber-500 text-black font-semibold text-sm"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
