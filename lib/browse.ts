/**
 * The one browse-data assembler, shared by the server-rendered first page
 * (app/page.tsx) and the /api/browse endpoint that infinite scroll pulls
 * subsequent pages from - both MUST interpret filters identically or page 2
 * would show different results than page 1's view of the world.
 */
import { discoverMovies, discoverTv, discoverUpcoming, discoverUpcomingTv, searchMovies, searchTv } from '@/lib/tmdb';
import { SUBGENRES, SORT_OPTIONS, DECADES } from '@/lib/subgenres';
import { ALL_GENRE, getGenre, type GenreDef } from '@/lib/genreCatalog';
import { getMenuConfig } from '@/lib/settings';
import type { SortOption, TmdbMovie } from '@/types';

export interface BrowseParamsInput {
  subgenres?: string;
  sort?: string;
  q?: string;
  decade?: string;
  genre?: string;
  upcomingGenre?: string;
  lang?: string;
  year?: string;
}

export interface BrowseArgs {
  isUpcoming: boolean;
  isGlobalSearch: boolean;
  activeGenre: GenreDef;
  upcomingGenre: GenreDef;
  defaultGenre: GenreDef;
  query: string;
  keywordIds: number[];
  sort: SortOption;
  dateGte?: string;
  dateLte?: string;
  language: string;
  minVotes: number;
  yearParam: string | null;
  currentYear: string;
}

export interface BrowsePage {
  results: TmdbMovie[];
  totalPages: number;
  totalResults: number;
}

export async function parseBrowseParams(params: BrowseParamsInput): Promise<BrowseArgs> {
  const config = await getMenuConfig();
  const defaultGenre = config.genres[0] ?? ALL_GENRE;
  const isUpcoming = params.genre === 'upcoming';
  const isGlobalSearch = params.genre === 'search';
  const activeGenre = isUpcoming || isGlobalSearch ? defaultGenre : getGenre(params.genre, defaultGenre);
  const upcomingGenre = isUpcoming ? getGenre(params.upcomingGenre) : activeGenre;

  const query = params.q?.trim() ?? '';
  const activeSubgenreIds = params.subgenres ? params.subgenres.split(',').filter(Boolean) : [];
  const keywordIds = SUBGENRES.filter((s) => activeSubgenreIds.includes(s.id)).flatMap((s) => s.keywordIds);

  const sort = (
    SORT_OPTIONS.some((o) => o.value === params.sort) ? params.sort : 'vote_average.desc'
  ) as SortOption;

  const decade = DECADES.find((d) => d.value === params.decade);
  const language = params.lang === 'all' ? '' : 'en';
  const yearParam = params.year?.match(/^\d{4}$/) ? params.year : null;
  const dateGte = yearParam ? `${yearParam}-01-01` : decade?.gte;
  const dateLte = yearParam ? `${yearParam}-12-31` : decade?.lte;
  const currentYear = new Date().getFullYear().toString();
  const minVotes = yearParam === currentYear ? 3 : 50;

  return {
    isUpcoming,
    isGlobalSearch,
    activeGenre,
    upcomingGenre,
    defaultGenre,
    query,
    keywordIds,
    sort,
    dateGte,
    dateLte,
    language,
    minVotes,
    yearParam,
    currentYear,
  };
}

const EMPTY_PAGE = { page: 1, results: [] as TmdbMovie[], total_pages: 1, total_results: 0 };

/** One page of browse results for the given filters - the infinite-scroll unit. */
export async function fetchBrowsePage(args: BrowseArgs, page: number): Promise<BrowsePage> {
  const {
    isUpcoming, isGlobalSearch, activeGenre, upcomingGenre, query, keywordIds,
    sort, dateGte, dateLte, language, minVotes, yearParam, currentYear,
  } = args;
  const hasMovies = Boolean(activeGenre.movieGenreId);
  const hasTv = Boolean(activeGenre.tvGenreId);

  if (isGlobalSearch) {
    if (!query) return { results: [], totalPages: 1, totalResults: 0 };
    const [movieData, tvData] = await Promise.all([searchMovies(query, page), searchTv(query, page)]);
    return {
      results: [...movieData.results, ...tvData.results],
      totalPages: Math.max(movieData.total_pages, tvData.total_pages),
      totalResults: movieData.total_results + tvData.total_results,
    };
  }

  if (isUpcoming) {
    const [movieData, tvData] = await Promise.all([
      upcomingGenre.movieGenreId
        ? discoverUpcoming({ page, genre: upcomingGenre.movieGenreId, language, keywordIds })
        : Promise.resolve(EMPTY_PAGE),
      upcomingGenre.tvGenreId
        ? discoverUpcomingTv({ page, genre: upcomingGenre.tvGenreId, language, keywordIds })
        : Promise.resolve(EMPTY_PAGE),
    ]);
    const merged = [...movieData.results, ...tvData.results].sort(
      (a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? '')
    );
    return {
      results: merged,
      totalPages: Math.max(movieData.total_pages, tvData.total_pages),
      totalResults: movieData.total_results + tvData.total_results,
    };
  }

  if (!hasMovies && query) {
    const data = await searchTv(query, page);
    return { results: data.results, totalPages: data.total_pages, totalResults: data.total_results };
  }

  if (!hasMovies) {
    const data = await discoverTv({ page, sortBy: sort, minVotes, dateGte, dateLte, language, genre: activeGenre.tvGenreId });
    return { results: data.results, totalPages: data.total_pages, totalResults: data.total_results };
  }

  if (!hasTv && query) {
    const data = await searchMovies(query, page);
    return { results: data.results, totalPages: data.total_pages, totalResults: data.total_results };
  }

  if (!hasTv) {
    const data = await discoverMovies({ page, sortBy: sort, minVotes, dateGte, dateLte, language, genre: activeGenre.movieGenreId });
    return { results: data.results, totalPages: data.total_pages, totalResults: data.total_results };
  }

  if (query) {
    const [movieData, tvData] = await Promise.all([searchMovies(query, page), searchTv(query, page)]);
    return {
      results: [...movieData.results, ...tvData.results],
      totalPages: Math.max(movieData.total_pages, tvData.total_pages),
      totalResults: movieData.total_results + tvData.total_results,
    };
  }

  const movieArgs = { page, sortBy: sort, keywordIds, minVotes: keywordIds.length > 0 ? 5 : minVotes, dateGte, dateLte, language, genre: activeGenre.movieGenreId };
  const tvMinVotes = yearParam === currentYear ? 0 : keywordIds.length > 0 ? 5 : minVotes;
  const tvArgs = { page, sortBy: sort, minVotes: tvMinVotes, dateGte, dateLte, language, genre: activeGenre.tvGenreId, keywordIds };
  const [movieData, tvData] = await Promise.all([discoverMovies(movieArgs), discoverTv(tvArgs)]);
  // Movies first (already sorted by TMDb), TV appended after - movies always appear
  return {
    results: [...movieData.results, ...tvData.results],
    totalPages: Math.max(movieData.total_pages, tvData.total_pages),
    totalResults: movieData.total_results + tvData.total_results,
  };
}
