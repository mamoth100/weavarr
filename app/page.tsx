import { Suspense } from 'react';
import { discoverDocumentaries, discoverTv, discoverUpcoming, searchDocumentaries, enrichWithLanguage } from '@/lib/tmdb';
import { SUBGENRES, SORT_OPTIONS, DECADES } from '@/lib/subgenres';
import CardGrid from '@/components/CardGrid';
import FilterBar from '@/components/FilterBar';
import Pagination from '@/components/Pagination';
import GenreSwitcher from '@/components/GenreSwitcher';
import type { SortOption } from '@/types';

interface PageProps {
  searchParams: { subgenres?: string; sort?: string; page?: string; q?: string; decade?: string; genre?: string; lang?: string; year?: string; show?: string; sucks?: string };
}

export default async function Home({ searchParams }: PageProps) {
  const genre = searchParams.genre === 'reality' ? 'reality' : searchParams.genre === 'upcoming' ? 'upcoming' : 'documentary';
  const isReality = genre === 'reality';
  const isUpcoming = genre === 'upcoming';
  const query = searchParams.q?.trim() ?? '';
  const activeSubgenreIds = searchParams.subgenres
    ? searchParams.subgenres.split(',').filter(Boolean)
    : [];
  const activeSubgenres = SUBGENRES.filter((s) => activeSubgenreIds.includes(s.id));
  const keywordIds = activeSubgenres.flatMap((s) => s.keywordIds);

  const sort = (
    SORT_OPTIONS.some((o) => o.value === searchParams.sort)
      ? searchParams.sort
      : 'vote_average.desc'
  ) as SortOption;

  const decade = DECADES.find((d) => d.value === searchParams.decade);
  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));
  // 'en' by default; 'all' means no language filter
  const language = searchParams.lang === 'all' ? '' : 'en';

  // Specific year overrides decade date range
  const yearParam = searchParams.year?.match(/^\d{4}$/) ? searchParams.year : null;
  const dateGte = yearParam ? `${yearParam}-01-01` : decade?.gte;
  const dateLte = yearParam ? `${yearParam}-12-31` : decade?.lte;
  const currentYear = new Date().getFullYear().toString();
  const minVotes = yearParam === currentYear ? 3 : 50;

  const data = isUpcoming
    ? await discoverUpcoming(page)
    : isReality
    ? await (async () => {
        const p1 = await discoverTv({ page, sortBy: sort, minVotes, dateGte, dateLte, language });
        if (p1.total_pages <= page) return p1;
        const p2 = await discoverTv({ page: page + 1, sortBy: sort, minVotes, dateGte, dateLte, language });
        return { ...p1, results: [...p1.results, ...p2.results] };
      })()
    : query
    ? await searchDocumentaries(query, page)
    : await (async () => {
        const args = { page, sortBy: sort, keywordIds, minVotes: keywordIds.length > 0 ? 5 : minVotes, dateGte, dateLte, language };
        const p1 = await discoverDocumentaries(args);
        if (p1.total_pages <= page) return p1;
        const p2 = await discoverDocumentaries({ ...args, page: page + 1 });
        return { ...p1, results: [...p1.results, ...p2.results] };
      })();

  const mediaType = isReality ? 'tv' : 'movie';
  const enriched = isUpcoming ? data : { ...data, results: await enrichWithLanguage(data.results, mediaType) };

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Docu<span className="text-amber-400">View</span>
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {isReality ? 'Reality TV discovery engine' : isUpcoming ? 'Documentaries coming soon' : 'The documentary discovery engine'}
            </p>
          </div>
          <div className="flex items-center gap-4 mt-1">
              <a
                id="nav-favorites"
                href="/favorites"
                className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-amber-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
                </svg>
                Favorites
              </a>
              <a
                id="nav-watched"
                href="/watched"
                className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-amber-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                Watched
              </a>
              <a
                id="nav-sucks"
                href="/sucks"
                className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-red-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 15h2.25m8.024-9.75c.011.05.028.1.052.148.591 1.2.924 2.55.924 3.977a8.96 8.96 0 01-.999 4.125m.023-8.25c-.076-.365.183-.75.575-.75h.908c.889 0 1.713.518 1.972 1.368.339 1.11.521 2.287.521 3.507 0 1.553-.295 3.036-.831 4.398-.306.774-1.105 1.25-1.987 1.25H14.5m0 0l-4.072 1.957a1.5 1.5 0 01-2.181-1.341V16.5M7.5 15V9.75a.75.75 0 01.75-.75h1.5" />
                </svg>
                Sucks
              </a>
            </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-5 pb-2">
        <Suspense>
          <GenreSwitcher />
        </Suspense>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Suspense fallback={<div className="h-32 bg-zinc-900 rounded-lg animate-pulse" />}>
          <FilterBar
            activeSubgenres={activeSubgenreIds}
            currentSort={sort}
            currentDecade={searchParams.decade ?? ''}
            currentQuery={query}
            currentLang={searchParams.lang ?? 'en'}
            currentYear={searchParams.year ?? ''}
          />
        </Suspense>

        {data.results.length === 0 ? (
          <div className="text-center text-zinc-500 py-24">
            No documentaries found.
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-600 mt-4 mb-2">
              {data.total_results.toLocaleString()} results
            </p>
            <Suspense fallback={<div className="h-64 bg-zinc-900 rounded-lg animate-pulse" />}>
              <CardGrid
                items={enriched.results}
                mediaType={mediaType}
                variant={isUpcoming ? 'upcoming' : 'default'}
              />
            </Suspense>

            <Pagination
              page={page}
              totalPages={data.total_pages}
              subgenres={searchParams.subgenres}
              sort={sort}
              decade={searchParams.decade}
              query={query}
              genre={genre}
              lang={searchParams.lang}
              year={searchParams.year}
              show={searchParams.show}
              sucks={searchParams.sucks}
            />
          </>
        )}
      </div>
    </main>
  );
}

