import { Suspense } from 'react';
import { ALL_GENRES_ID } from '@/lib/genreCatalog';
import { parseBrowseParams, fetchBrowsePage, type SpecialView } from '@/lib/browse';
import FilterBar from '@/components/FilterBar';
import InfiniteBrowse from '@/components/InfiniteBrowse';
import DiscoverHome from '@/components/DiscoverHome';
import AppShell from '@/components/AppShell';

const SPECIAL_VIEW_TITLES: Record<SpecialView, string> = {
  trending: 'Trending This Week',
  'popular-movies': 'Popular Movies',
  'popular-tv': 'Popular Shows',
};

interface PageProps {
  searchParams: { subgenres?: string; sort?: string; page?: string; q?: string; decade?: string; genre?: string; upcomingGenre?: string; lang?: string; year?: string; show?: string; sucks?: string; fav?: string };
}

export default async function Home({ searchParams }: PageProps) {
  const args = await parseBrowseParams(searchParams);
  const { isUpcoming, isGlobalSearch, isDiscover, specialView, activeGenre, upcomingGenre, defaultGenre, query, sort } = args;

  // The Discover landing is sections, not a grid - no filter bar, no
  // infinite scroll. Each section's "See all" leads to a full grid view.
  if (isDiscover) {
    return (
      <AppShell title="Discover">
        <div className="max-w-7xl mx-auto px-4 py-6">
          <DiscoverHome />
        </div>
      </AppShell>
    );
  }

  // Page 1 renders on the server; InfiniteBrowse appends pages 2+ from
  // /api/browse as the user scrolls. This string is the filter contract
  // between the two - it must contain every param parseBrowseParams reads.
  const browseQuery = new URLSearchParams(
    Object.entries({
      subgenres: searchParams.subgenres,
      sort: searchParams.sort,
      q: searchParams.q,
      decade: searchParams.decade,
      genre: searchParams.genre,
      upcomingGenre: searchParams.upcomingGenre,
      lang: searchParams.lang,
      year: searchParams.year,
    }).filter(([, v]) => v !== undefined) as [string, string][]
  ).toString();

  const data = await fetchBrowsePage(args, 1);
  const mediaType = specialView === 'popular-tv' ? 'tv' : activeGenre.movieGenreId ? 'movie' : 'tv';

  const pageTitle = isGlobalSearch
    ? 'Search anything - movies, TV, any genre'
    : specialView
    ? SPECIAL_VIEW_TITLES[specialView]
    : isUpcoming
    ? upcomingGenre.id === ALL_GENRES_ID
      ? 'Coming soon - every genre'
      : `${upcomingGenre.label} coming soon`
    : activeGenre.label;

  return (
    <AppShell title={pageTitle}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Trending/Popular are curated pre-ranked lists - TMDB's endpoints
            take no filters, so showing the filter bar would be a lie. */}
        {!specialView && (
        <Suspense fallback={<div className="h-32 bg-zinc-900 rounded-lg animate-pulse" />}>
          <FilterBar
            activeSubgenres={searchParams.subgenres ? searchParams.subgenres.split(',').filter(Boolean) : []}
            currentSort={sort}
            currentDecade={searchParams.decade ?? ''}
            currentQuery={query}
            currentLang={searchParams.lang ?? 'en'}
            currentYear={searchParams.year ?? ''}
            defaultGenreId={defaultGenre.id}
            currentUpcomingGenre={searchParams.upcomingGenre ?? ''}
          />
        </Suspense>
        )}

        {isGlobalSearch && !query ? (
          <div className="text-center text-zinc-500 py-24">
            Type something above to search everything - movies, TV, any genre.
          </div>
        ) : data.results.length === 0 ? (
          <div className="text-center text-zinc-500 py-24">
            {isGlobalSearch || specialView
              ? 'No results found.'
              : isUpcoming
              ? `No upcoming ${upcomingGenre.id === ALL_GENRES_ID ? 'releases' : upcomingGenre.label.toLowerCase()} found.`
              : activeGenre.id === ALL_GENRES_ID
              ? 'No results found.'
              : `No ${activeGenre.label.toLowerCase()} found.`}
          </div>
        ) : (
          <Suspense fallback={<div className="h-64 bg-zinc-900 rounded-lg animate-pulse" />}>
            {/* key: filters changed = a different list - remount so the
                scroll state, de-dupe set, and page cursor start fresh */}
            <InfiniteBrowse
              key={browseQuery}
              initialItems={data.results}
              initialTotalPages={data.totalPages}
              totalResults={data.totalResults}
              queryString={browseQuery}
              mediaType={mediaType}
              variant={isUpcoming ? 'upcoming' : 'default'}
              mode={isGlobalSearch ? 'search' : 'grid'}
            />
          </Suspense>
        )}
      </div>
    </AppShell>
  );
}
