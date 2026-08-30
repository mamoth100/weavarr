/**
 * The one browse-data assembler, shared by the server-rendered first page
 * (app/page.tsx) and the /api/browse endpoint that infinite scroll pulls
 * subsequent pages from - both MUST interpret filters identically or page 2
 * would show different results than page 1's view of the world.
 */
import { discoverMovies, discoverTv, discoverUpcoming, discoverUpcomingTv, enrichWithLanguage, getPopularMovies, getPopularTv, getTrendingWeek, searchMovies, searchTv } from '@/lib/tmdb';
import { SUBGENRES, SORT_OPTIONS, DECADES } from '@/lib/subgenres';
import { ALL_GENRE, DISCOVER_ID, getGenre, type GenreDef } from '@/lib/genreCatalog';
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

/** Curated TMDB lists that have their own see-all views but aren't genres - no filters apply, just pages of the list. */
export type SpecialView = 'trending' | 'popular' | 'popular-movies' | 'popular-tv';
const SPECIAL_VIEWS: SpecialView[] = ['trending', 'popular', 'popular-movies', 'popular-tv'];

export interface BrowseArgs {
  isUpcoming: boolean;
  isGlobalSearch: boolean;
  /** True = render the sectioned Discover home instead of a browse grid. */
  isDiscover: boolean;
  specialView: SpecialView | null;
  /** On a special view: a filter is set, so the curated endpoint gives way to a filterable discover query. */
  specialFiltersActive: boolean;
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
  const landingGenre = config.genres[0] ?? ALL_GENRE;
  // Discover is a landing/section page, not a fetchable genre - wherever the
  // pipeline needs a real genre as a placeholder or fallback, skip past it.
  const defaultGenre = landingGenre.id === DISCOVER_ID
    ? config.genres.find((g) => g.id !== DISCOVER_ID) ?? ALL_GENRE
    : landingGenre;
  const isUpcoming = params.genre === 'upcoming';
  const isGlobalSearch = params.genre === 'search';
  const specialView = SPECIAL_VIEWS.find((v) => v === params.genre) ?? null;
  const isDiscover = params.genre === DISCOVER_ID || (!params.genre && landingGenre.id === DISCOVER_ID);
  const activeGenre =
    isUpcoming || isGlobalSearch || specialView || isDiscover ? defaultGenre : getGenre(params.genre, defaultGenre);
  const upcomingGenre = isUpcoming ? getGenre(params.upcomingGenre) : activeGenre;

  const query = params.q?.trim() ?? '';
  const activeSubgenreIds = params.subgenres ? params.subgenres.split(',').filter(Boolean) : [];
  const keywordIds = SUBGENRES.filter((s) => activeSubgenreIds.includes(s.id)).flatMap((s) => s.keywordIds);

  const sortValid = SORT_OPTIONS.some((o) => o.value === params.sort);
  // Special views default to popularity - they ARE popularity lists, and the
  // filtered fallback should keep that feel unless a sort is chosen.
  const sort = (sortValid ? params.sort : specialView ? 'popularity.desc' : 'vote_average.desc') as SortOption;

  // Any touched filter on a curated view flips it from TMDB's endpoint (which
  // takes no filters at all) to a discover query sorted by popularity - the
  // same honest mapping the genre-scoped Discover sections use.
  const specialFiltersActive = Boolean(query || params.subgenres || sortValid || params.decade || params.year || params.lang);

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
    isDiscover,
    specialView,
    specialFiltersActive,
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

/**
 * TMDB's discover filter runs on original_language, and that field is
 * community-edited and sometimes flat wrong (La Casa de los Famosos, a
 * Telemundo show, is tagged "en"). spoken_languages on the detail record
 * is reliable, so with the English filter active each result gets
 * verified against it (per-title lookups, cached a day) and confirmed
 * non-English ones are dropped. Unknown stays in - only positive proof
 * removes a title.
 */
export async function dropMislabeledForeign(results: TmdbMovie[], language: string, fallbackType: 'movie' | 'tv'): Promise<TmdbMovie[]> {
  if (language !== 'en' || results.length === 0) return results;
  const enriched = await enrichWithLanguage(results, fallbackType);
  return enriched.filter((r) => !r.spoken_language || r.spoken_language === 'English');
}

/**
 * Search ordering: exact title matches first, then TMDB popularity.
 * Popularity alone is a TRENDING metric - searching "friends" put the
 * currently-airing "Among Friends" above the sitcom Friends itself, which
 * is never what someone typing an exact title means.
 */
function rankSearchResults(results: TmdbMovie[], query: string): TmdbMovie[] {
  const q = query.toLowerCase().trim();
  return [...results].sort((a, b) => {
    const aExact = (a.title ?? '').toLowerCase().trim() === q ? 1 : 0;
    const bExact = (b.title ?? '').toLowerCase().trim() === q ? 1 : 0;
    if (aExact !== bExact) return bExact - aExact;
    return (b.popularity ?? 0) - (a.popularity ?? 0);
  });
}

/** One page of browse results for the given filters - the infinite-scroll unit. */
export async function fetchBrowsePage(args: BrowseArgs, page: number): Promise<BrowsePage> {
  const {
    isUpcoming, isGlobalSearch, activeGenre, upcomingGenre, query, keywordIds,
    sort, dateGte, dateLte, language, minVotes, yearParam, currentYear,
  } = args;
  const hasMovies = Boolean(activeGenre.movieGenreId);
  const hasTv = Boolean(activeGenre.tvGenreId);

  // Curated lists come pre-ranked from TMDB while untouched; the moment a
  // filter is set they become discover queries (popularity-sorted unless a
  // sort was chosen), since TMDB's trending/popular endpoints take no
  // filters at all.
  if (args.specialView && args.specialFiltersActive) {
    const wantMovies = args.specialView !== 'popular-tv';
    const wantTv = args.specialView !== 'popular-movies';

    if (query) {
      const [movieData, tvData] = await Promise.all([
        wantMovies ? searchMovies(query, page) : Promise.resolve(EMPTY_PAGE),
        wantTv ? searchTv(query, page) : Promise.resolve(EMPTY_PAGE),
      ]);
      return {
        results: rankSearchResults([...movieData.results, ...tvData.results], query),
        totalPages: Math.max(movieData.total_pages, tvData.total_pages),
        totalResults: movieData.total_results + tvData.total_results,
      };
    }

    const [movieData, tvData] = await Promise.all([
      wantMovies
        ? discoverMovies({ page, sortBy: sort, keywordIds, minVotes, dateGte, dateLte, language, genre: 'all' })
        : Promise.resolve(EMPTY_PAGE),
      wantTv
        ? discoverTv({ page, sortBy: sort, minVotes, dateGte, dateLte, language, genre: 'all', keywordIds })
        : Promise.resolve(EMPTY_PAGE),
    ]);
    // Merge by the sort's own metric when it's popularity (keeps the
    // trending feel); otherwise movies-then-TV like the genre grids.
    const merged =
      sort === 'popularity.desc'
        ? [...movieData.results, ...tvData.results].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
        : [...movieData.results, ...tvData.results];
    return {
      results: merged,
      totalPages: Math.max(movieData.total_pages, tvData.total_pages),
      totalResults: movieData.total_results + tvData.total_results,
    };
  }

  // Curated lists come pre-ranked from TMDB - no filters, no genre math.
  if (args.specialView) {
    if (args.specialView === 'popular') {
      // Mixed popular: both endpoints per page, interleaved so neither
      // medium buries the other.
      const [movies, tv] = await Promise.all([getPopularMovies(page), getPopularTv(page)]);
      const merged: typeof movies.results = [];
      const max = Math.max(movies.results.length, tv.results.length);
      for (let i = 0; i < max; i++) {
        if (movies.results[i]) merged.push(movies.results[i]);
        if (tv.results[i]) merged.push(tv.results[i]);
      }
      return {
        results: merged,
        totalPages: Math.max(movies.total_pages, tv.total_pages),
        totalResults: movies.total_results + tv.total_results,
      };
    }
    const data =
      args.specialView === 'trending'
        ? await getTrendingWeek(page)
        : args.specialView === 'popular-movies'
        ? await getPopularMovies(page)
        : await getPopularTv(page);
    return { results: data.results, totalPages: data.total_pages, totalResults: data.total_results };
  }

  if (isGlobalSearch) {
    if (!query) return { results: [], totalPages: 1, totalResults: 0 };
    const [movieData, tvData] = await Promise.all([searchMovies(query, page), searchTv(query, page)]);
    // A plain movies-then-TV concat buried the most popular match whenever
    // it was a show (searching "friends" listed every Friends-titled movie
    // above the sitcom) - rank instead.
    return {
      results: rankSearchResults([...movieData.results, ...tvData.results], query),
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
    return { results: await dropMislabeledForeign(data.results, language, 'tv'), totalPages: data.total_pages, totalResults: data.total_results };
  }

  if (!hasTv && query) {
    const data = await searchMovies(query, page);
    return { results: data.results, totalPages: data.total_pages, totalResults: data.total_results };
  }

  if (!hasTv) {
    const data = await discoverMovies({ page, sortBy: sort, minVotes, dateGte, dateLte, language, genre: activeGenre.movieGenreId });
    return { results: await dropMislabeledForeign(data.results, language, 'movie'), totalPages: data.total_pages, totalResults: data.total_results };
  }

  if (query) {
    const [movieData, tvData] = await Promise.all([searchMovies(query, page), searchTv(query, page)]);
    // Same exact-match + popularity ranking as global search.
    return {
      results: rankSearchResults([...movieData.results, ...tvData.results], query),
      totalPages: Math.max(movieData.total_pages, tvData.total_pages),
      totalResults: movieData.total_results + tvData.total_results,
    };
  }

  const movieArgs = { page, sortBy: sort, keywordIds, minVotes: keywordIds.length > 0 ? 5 : minVotes, dateGte, dateLte, language, genre: activeGenre.movieGenreId };
  const tvMinVotes = yearParam === currentYear ? 0 : keywordIds.length > 0 ? 5 : minVotes;
  const tvArgs = { page, sortBy: sort, minVotes: tvMinVotes, dateGte, dateLte, language, genre: activeGenre.tvGenreId, keywordIds };
  const [movieData, tvData] = await Promise.all([discoverMovies(movieArgs), discoverTv(tvArgs)]);
  const [cleanMovies, cleanTv] = await Promise.all([
    dropMislabeledForeign(movieData.results, language, 'movie'),
    dropMislabeledForeign(tvData.results, language, 'tv'),
  ]);
  // Movies first (already sorted by TMDb), TV appended after - movies always appear
  return {
    results: [...cleanMovies, ...cleanTv],
    totalPages: Math.max(movieData.total_pages, tvData.total_pages),
    totalResults: movieData.total_results + tvData.total_results,
  };
}
