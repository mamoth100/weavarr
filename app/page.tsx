import { Suspense } from 'react';
import { discoverDocumentaries, discoverTv, discoverUpcoming, searchDocumentaries } from '@/lib/tmdb';
import { SUBGENRES, SORT_OPTIONS, DECADES } from '@/lib/subgenres';
import DocCard from '@/components/DocCard';
import FilterBar from '@/components/FilterBar';
import Pagination from '@/components/Pagination';
import GenreSwitcher from '@/components/GenreSwitcher';
import type { SortOption } from '@/types';

interface PageProps {
  searchParams: { subgenres?: string; sort?: string; page?: string; q?: string; decade?: string; genre?: string; providers?: string };
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

  const providerIds = searchParams.providers
    ? searchParams.providers.split(',').map(Number).filter(Boolean)
    : [];

  const data = isUpcoming
    ? await discoverUpcoming(page, providerIds)
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
        <h1 className="text-2xl font-bold tracking-tight">
          Docu<span className="text-amber-400">View</span>
        </h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          {isReality ? 'Reality TV discovery engine' : isUpcoming ? 'Documentaries coming soon' : 'The documentary discovery engine'}
        </p>
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
              providers={searchParams.providers}
            />
          </>
        )}
      </div>
    </main>
  );
}

