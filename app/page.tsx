import { Suspense } from 'react';
import { discoverDocumentaries } from '@/lib/tmdb';
import { SUBGENRES, SORT_OPTIONS } from '@/lib/subgenres';
import DocCard from '@/components/DocCard';
import FilterBar from '@/components/FilterBar';
import Pagination from '@/components/Pagination';
import type { SortOption } from '@/types';

interface PageProps {
  searchParams: { subgenres?: string; sort?: string; page?: string };
}

export default async function Home({ searchParams }: PageProps) {
  // Multi-select: comma-separated subgenre IDs
  const activeSubgenreIds = searchParams.subgenres
    ? searchParams.subgenres.split(',').filter(Boolean)
    : [];

  const activeSubgenres = SUBGENRES.filter((s) =>
    activeSubgenreIds.includes(s.id)
  );

  // Combine all keyword IDs from every selected subgenre
  const keywordIds = activeSubgenres.flatMap((s) => s.keywordIds);

  const sort = (
    SORT_OPTIONS.some((o) => o.value === searchParams.sort)
      ? searchParams.sort
      : 'vote_average.desc'
  ) as SortOption;

  const page = Math.max(1, parseInt(searchParams.page ?? '1', 10));

  const data = await discoverDocumentaries({
    page,
    sortBy: sort,
    keywordIds,
    minVotes: 50,
  });

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-5">
        <h1 className="text-2xl font-bold tracking-tight">
          Docu<span className="text-amber-400">View</span>
        </h1>
        <p className="text-zinc-500 text-sm mt-0.5">
          The documentary discovery engine
        </p>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6">
        <Suspense fallback={<div className="h-20 bg-zinc-900 rounded-lg animate-pulse" />}>
          <FilterBar
            activeSubgenres={activeSubgenreIds}
            currentSort={sort}
          />
        </Suspense>

        {data.results.length === 0 ? (
          <div className="text-center text-zinc-500 py-24">
            No documentaries found for this filter.
          </div>
        ) : (
          <>
            <p className="text-xs text-zinc-600 mt-4 mb-2">
              {data.total_results.toLocaleString()} results
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {data.results.map((doc) => (
                <DocCard key={doc.id} doc={doc} />
              ))}
            </div>

            <Pagination
              page={page}
              totalPages={data.total_pages}
              subgenres={searchParams.subgenres}
              sort={sort}
            />
          </>
        )}
      </div>
    </main>
  );
}
