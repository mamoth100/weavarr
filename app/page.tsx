import { Suspense } from 'react';
import { discoverMovies, discoverTv, discoverUpcoming, discoverUpcomingTv, searchMovies, searchTv } from '@/lib/tmdb';
import { SUBGENRES, SORT_OPTIONS, DECADES } from '@/lib/subgenres';
import { ALL_GENRE, ALL_GENRES_ID, getGenre } from '@/lib/genreCatalog';
import { getMenuConfig } from '@/lib/settings';
import CardGrid from '@/components/CardGrid';
import FilterBar from '@/components/FilterBar';
import Pagination from '@/components/Pagination';
import AppShell from '@/components/AppShell';
import SearchResultCard from '@/components/SearchResultCard';
import type { SortOption } from '@/types';

interface PageProps {
  searchParams: { subgenres?: string; sort?: string; page?: string; q?: string; decade?: string; genre?: string; upcomingGenre?: string; lang?: string; year?: string; show?: string; sucks?: string; fav?: string };
}

export default async function Home({ searchParams }: PageProps) {
  const config = await getMenuConfig();
  const defaultGenre = config.genres[0] ?? ALL_GENRE;
  const isUpcoming = searchParams.genre === 'upcoming';
  const isGlobalSearch = searchParams.genre === 'search';
  const activeGenre = isUpcoming || isGlobalSearch ? defaultGenre : getGenre(searchParams.genre, defaultGenre);
  const genre = isUpcoming ? 'upcoming' : isGlobalSearch ? 'search' : activeGenre.id;
  // Coming Soon has its own genre selection (defaults to All Genres) - 'genre'
  // itself has to stay the literal 'upcoming' sentinel to signal this view.
  const upcomingGenre = isUpcoming ? getGenre(searchParams.upcomingGenre) : activeGenre;
  const hasMovies = Boolean(activeGenre.movieGenreId);
  const hasTv = Boolean(activeGenre.tvGenreId);
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

  const data = isGlobalSearch
    ? await (async () => {
        if (!query) return { page: 1, results: [], total_pages: 1, total_results: 0 };
        const [movieData, tvData] = await Promise.all([
          searchMovies(query, page),
          searchTv(query, page),
        ]);
        return {
          ...movieData,
          results: [...movieData.results, ...tvData.results],
          total_results: movieData.total_results + tvData.total_results,
          total_pages: Math.max(movieData.total_pages, tvData.total_pages),
        };
      })()
    : isUpcoming
    ? await (async () => {
        const emptyPage = { page: 1, results: [], total_pages: 1, total_results: 0 };
        const [movieData, tvData] = await Promise.all([
          upcomingGenre.movieGenreId
            ? discoverUpcoming({ page, genre: upcomingGenre.movieGenreId, language, keywordIds })
            : Promise.resolve(emptyPage),
          upcomingGenre.tvGenreId
            ? discoverUpcomingTv({ page, genre: upcomingGenre.tvGenreId, language, keywordIds })
            : Promise.resolve(emptyPage),
        ]);
        const merged = [...movieData.results, ...tvData.results].sort(
          (a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? '')
        );
        return {
          ...movieData,
          results: merged,
          total_results: movieData.total_results + tvData.total_results,
          total_pages: Math.max(movieData.total_pages, tvData.total_pages),
        };
      })()
    : !hasMovies && query
    ? await searchTv(query, page)
    : !hasMovies
    ? await (async () => {
        const p1 = await discoverTv({ page, sortBy: sort, minVotes, dateGte, dateLte, language, genre: activeGenre.tvGenreId });
        if (p1.total_pages <= page) return p1;
        const p2 = await discoverTv({ page: page + 1, sortBy: sort, minVotes, dateGte, dateLte, language, genre: activeGenre.tvGenreId });
        return { ...p1, results: [...p1.results, ...p2.results] };
      })()
    : !hasTv && query
    ? await searchMovies(query, page)
    : !hasTv
    ? await (async () => {
        const p1 = await discoverMovies({ page, sortBy: sort, minVotes, dateGte, dateLte, language, genre: activeGenre.movieGenreId });
        if (p1.total_pages <= page) return p1;
        const p2 = await discoverMovies({ page: page + 1, sortBy: sort, minVotes, dateGte, dateLte, language, genre: activeGenre.movieGenreId });
        return { ...p1, results: [...p1.results, ...p2.results] };
      })()
    : query
    ? await (async () => {
        const [movieData, tvData] = await Promise.all([
          searchMovies(query, page),
          searchTv(query, page),
        ]);
        return {
          ...movieData,
          results: [...movieData.results, ...tvData.results],
          total_results: movieData.total_results + tvData.total_results,
          total_pages: Math.max(movieData.total_pages, tvData.total_pages),
        };
      })()
    : await (async () => {
        const movieArgs = { page, sortBy: sort, keywordIds, minVotes: keywordIds.length > 0 ? 5 : minVotes, dateGte, dateLte, language, genre: activeGenre.movieGenreId };
        const tvMinVotes = yearParam === currentYear ? 0 : (keywordIds.length > 0 ? 5 : minVotes);
        const tvArgs = { page, sortBy: sort, minVotes: tvMinVotes, dateGte, dateLte, language, genre: activeGenre.tvGenreId, keywordIds };
        const [p1, tvP1] = await Promise.all([
          discoverMovies(movieArgs),
          discoverTv(tvArgs),
        ]);
        const [p2, tvP2] = await Promise.all([
          p1.total_pages > page ? discoverMovies({ ...movieArgs, page: page + 1 }) : null,
          tvP1.total_pages > page ? discoverTv({ ...tvArgs, page: page + 1 }) : null,
        ]);
        const movieResults = p2 ? [...p1.results, ...p2.results] : p1.results;
        const tvResults = tvP2 ? [...tvP1.results, ...tvP2.results] : tvP1.results;
        // Movies first (already sorted by TMDb), TV appended after - guarantees movies always appear
        const merged = [...movieResults, ...tvResults];
        return {
          ...p1,
          results: merged,
          total_results: p1.total_results + tvP1.total_results,
          total_pages: Math.max(p1.total_pages, tvP1.total_pages),
        };
      })();

  const mediaType = hasMovies ? 'movie' : 'tv';
  const enriched = data;

  const pageTitle = isGlobalSearch
    ? 'Search anything - movies, TV, any genre'
    : isUpcoming
    ? upcomingGenre.id === ALL_GENRES_ID
      ? 'Coming soon - every genre'
      : `${upcomingGenre.label} coming soon`
    : `${activeGenre.label} discovery engine`;

  return (
    <AppShell title={pageTitle}>
      <div className="max-w-7xl mx-auto px-4 py-6">
        <Suspense fallback={<div className="h-32 bg-zinc-900 rounded-lg animate-pulse" />}>
          <FilterBar
            activeSubgenres={activeSubgenreIds}
            currentSort={sort}
            currentDecade={searchParams.decade ?? ''}
            currentQuery={query}
            currentLang={searchParams.lang ?? 'en'}
            currentYear={searchParams.year ?? ''}
            defaultGenreId={defaultGenre.id}
            currentUpcomingGenre={searchParams.upcomingGenre ?? ''}
          />
        </Suspense>

        {isGlobalSearch && !query ? (
          <div className="text-center text-zinc-500 py-24">
            Type something above to search everything - movies, TV, any genre.
          </div>
        ) : data.results.length === 0 ? (
          <div className="text-center text-zinc-500 py-24">
            {isGlobalSearch
              ? 'No results found.'
              : isUpcoming
              ? `No upcoming ${upcomingGenre.id === ALL_GENRES_ID ? 'releases' : upcomingGenre.label.toLowerCase()} found.`
              : activeGenre.id === ALL_GENRES_ID
              ? 'No results found.'
              : `No ${activeGenre.label.toLowerCase()} found.`}
          </div>
        ) : isGlobalSearch ? (
          <>
            <p className="text-xs text-zinc-600 mt-4 mb-2">
              {data.total_results.toLocaleString()} results
            </p>
            <Suspense fallback={<div className="h-64 bg-zinc-900 rounded-lg animate-pulse" />}>
              <div className="space-y-3">
                {data.results.slice(0, 20).map((item) => (
                  <SearchResultCard key={`${item.id}:${item.mediaType ?? 'movie'}`} item={item} />
                ))}
              </div>
            </Suspense>

            <Pagination
              page={page}
              totalPages={data.total_pages}
              subgenres={searchParams.subgenres}
              sort={sort}
              decade={searchParams.decade}
              query={query}
              genre={genre}
              defaultGenre={defaultGenre.id}
              lang={searchParams.lang}
              year={searchParams.year}
              show={searchParams.show}
              sucks={searchParams.sucks}
              fav={searchParams.fav}
            />
          </>
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
              defaultGenre={defaultGenre.id}
              lang={searchParams.lang}
              year={searchParams.year}
              show={searchParams.show}
              sucks={searchParams.sucks}
              fav={searchParams.fav}
              upcomingGenre={searchParams.upcomingGenre}
            />
          </>
        )}
      </div>
    </AppShell>
  );
}

