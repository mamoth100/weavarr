import { Suspense } from 'react';
import { discoverMovies, discoverTv, discoverUpcoming, discoverUpcomingTv, searchMovies, searchTv } from '@/lib/tmdb';
import { SUBGENRES, SORT_OPTIONS, DECADES } from '@/lib/subgenres';
import { ALL_GENRE, ALL_GENRES_ID, getGenre } from '@/lib/genreCatalog';
import { getMenuConfig } from '@/lib/settings';
import CardGrid from '@/components/CardGrid';
import FilterBar from '@/components/FilterBar';
import Pagination from '@/components/Pagination';
import GenreSwitcher from '@/components/GenreSwitcher';
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

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <header className="border-b border-zinc-800 px-6 py-5">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Weav<span className="text-amber-400">arr</span>
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              {isGlobalSearch
                ? 'Search anything - movies, TV, any genre'
                : isUpcoming
                ? upcomingGenre.id === ALL_GENRES_ID
                  ? 'Coming soon - every genre'
                  : `${upcomingGenre.label} coming soon`
                : `${activeGenre.label} discovery engine`}
            </p>
          </div>
          <div className="flex items-center flex-wrap gap-4 sm:mt-1">
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
              <a
                id="nav-settings"
                href="/settings"
                className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-amber-400 transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Settings
              </a>
            </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 pt-5 pb-2">
        <Suspense>
          <GenreSwitcher config={config} />
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
    </main>
  );
}

