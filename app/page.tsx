import { Suspense } from 'react';
import { discoverDocumentaries, discoverTv, discoverUpcoming, searchDocumentaries } from '@/lib/tmdb';
import { SUBGENRES, SORT_OPTIONS, DECADES } from '@/lib/subgenres';
import DocCard from '@/components/DocCard';
import FilterBar from '@/components/FilterBar';
import Pagination from '@/components/Pagination';
import GenreSwitcher from '@/components/GenreSwitcher';
import type { SortOption } from '@/types';

interface PageProps {
  searchParams: { subgenres?: string; sort?: string; page?: string; q?: string; decade?: string; genre?: string };
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

  const data = isUpcoming
    ? await discoverUpcoming(page)
    : isReality
    ? await discoverTv({
        page,
        sortBy: sort,
        minVotes: 50,
        dateGte: decade?.gte,
        dateLte: decade?.lte,
      })
    : query
    ? await searchDocumentaries(query, page)
    : await discoverDocumentaries({
        page,
        sortBy: sort,
        keywordIds,
        minVotes: keywordIds.length > 0 ? 5 : 50,
        dateGte: decade?.gte,
        dateLte: decade?.lte,
      });

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
          <a
            href="/favorites"
            className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-amber-400 transition-colors mt-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12z" />
            </svg>
            Favorites
          </a>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {data.results.map((doc) => (
                <DocCard key={doc.id} doc={doc} mediaType={isReality ? 'tv' : 'movie'} variant={isUpcoming ? 'upcoming' : 'default'} />
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={data.total_pages}
              subgenres={searchParams.subgenres}
              sort={sort}
              decade={searchParams.decade}
              query={query}
              genre={genre}
            />
          </>
        )}
      </div>
    </main>
  );
}

