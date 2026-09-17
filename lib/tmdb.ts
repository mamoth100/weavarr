import { fetchWithTimeout } from './fetchTimeout';
import type { TmdbDetailResponse, TmdbDiscoverResponse, WatchProviders, TmdbPerson, TmdbMovie, TmdbCollection } from '@/types';
import type { MediaType } from '@/types';

const BASE_URL = 'https://api.themoviedb.org/3';

// Shared fallback so the app works without every self-hoster registering their
// own TMDB app - same pattern Seerr/Plex/Kodi use. A user-supplied TMDB_TOKEN
// still wins, giving them their own rate limit instead of sharing this one.
const BUNDLED_TMDB_TOKEN = 'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiJiMmJlZDhlYzEwNzBkOTg5M2Y5MWQ3YmQ3NDcxODNjYSIsIm5iZiI6MTc3OTgyMzI0MS4xOTkwMDAxLCJzdWIiOiI2YTE1ZjI4OTI3NjllMmMwOGUyZjVmYjYiLCJzY29wZXMiOlsiYXBpX3JlYWQiXSwidmVyc2lvbiI6MX0.azYXAjS2GknAn7Lsf3gvI4CvvE0X-2ZYpbETt0ojobc';

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.TMDB_TOKEN || BUNDLED_TMDB_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

/** TMDb occasionally times out or drops the connection transiently - retry once before giving up, so a passing network blip doesn't crash the page. */
async function tmdbFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetchWithTimeout(url, init);
  } catch {
    await new Promise((r) => setTimeout(r, 400));
    return fetchWithTimeout(url, init);
  }
}

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Fetch the primary spoken language for a single movie/TV item. Cached 24h. */
async function fetchSpokenLanguage(id: number, mediaType: 'movie' | 'tv'): Promise<string | null> {
  try {
    const res = await tmdbFetch(`${BASE_URL}/${mediaType}/${id}?fields=spoken_languages`, {
      headers: authHeaders(),
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.spoken_languages as { english_name: string }[] | undefined)?.[0]?.english_name ?? null;
  } catch {
    return null;
  }
}

/** Enrich a list of TmdbMovie results with accurate spoken_language. Runs in parallel. */
export async function enrichWithLanguage<T extends { id: number; spoken_language?: string; mediaType?: 'movie' | 'tv' }>(items: T[], defaultMediaType: 'movie' | 'tv'): Promise<T[]> {
  const languages = await Promise.all(items.map((item) => fetchSpokenLanguage(item.id, item.mediaType ?? defaultMediaType)));
  return items.map((item, i) => ({ ...item, spoken_language: languages[i] ?? undefined }));
}

export async function discoverMovies({
  page = 1,
  sortBy = 'vote_average.desc',
  keywordIds = [],
  minVotes = 50,
  dateGte,
  dateLte,
  language = 'en',
  genre = 99,
}: {
  page?: number;
  sortBy?: string;
  keywordIds?: number[];
  minVotes?: number;
  dateGte?: string;
  dateLte?: string;
  language?: string;
  genre?: number | string;
}): Promise<TmdbDiscoverResponse> {
  const params = new URLSearchParams({
    sort_by: sortBy,
    'vote_count.gte': String(minVotes),
    page: String(page),
    include_adult: 'false',
  });
  if (genre !== 'all') params.set('with_genres', String(genre));

  if (language) params.set('with_original_language', language);
  if (keywordIds.length > 0) {
    // | = OR logic: matches any of the keyword IDs
    params.set('with_keywords', keywordIds.join('|'));
  }
  if (dateGte) params.set('primary_release_date.gte', dateGte);
  if (dateLte) params.set('primary_release_date.lte', dateLte);

  const res = await tmdbFetch(`${BASE_URL}/discover/movie?${params}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });

  if (!res.ok) throw new Error(`TMDb discover failed: ${res.status}`);
  return res.json();
}

export async function getDocumentaryDetail(id: number): Promise<TmdbDetailResponse> {
  const res = await tmdbFetch(
    `${BASE_URL}/movie/${id}?append_to_response=keywords,external_ids,videos,recommendations,credits`,
    { headers: authHeaders(), next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error(`TMDb detail failed: ${res.status}`);
  return res.json();
}

export async function searchMovies(
  query: string,
  page = 1
): Promise<TmdbDiscoverResponse> {
  const params = new URLSearchParams({
    query,
    page: String(page),
    include_adult: 'false',
  });

  const res = await tmdbFetch(`${BASE_URL}/search/movie?${params}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb search failed: ${res.status}`);
  return res.json();
}

export async function searchTv(
  query: string,
  page = 1
): Promise<TmdbDiscoverResponse> {
  const params = new URLSearchParams({
    query,
    page: String(page),
    include_adult: 'false',
  });

  const res = await tmdbFetch(`${BASE_URL}/search/tv?${params}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb TV search failed: ${res.status}`);
  const data = await res.json();
  return { ...data, results: data.results.map(normalizeTvResult) };
}

/** Normalize a raw TMDB TV result to the movie shape the cards render. */
function normalizeTvResult(show: Record<string, unknown>) {
  return {
    ...show,
    title: (show.name as string) ?? show.title,
    release_date: (show.first_air_date as string) ?? show.release_date ?? '',
    mediaType: 'tv' as const,
  };
}

/**
 * Trending this week - the Discover home's headline row and the
 * ?genre=trending see-all view. media picks the endpoint: /trending/all
 * mixes people in (filtered out here), movie/tv are homogeneous but still
 * get tagged so mixed grids route clicks to the right detail page.
 */
export async function getTrendingWeek(page = 1, media: 'all' | 'movie' | 'tv' = 'all'): Promise<TmdbDiscoverResponse> {
  const res = await tmdbFetch(`${BASE_URL}/trending/${media}/week?page=${page}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb trending failed: ${res.status}`);
  const data = await res.json();
  const results = (data.results as Record<string, unknown>[])
    .filter((r) => media !== 'all' || r.media_type === 'movie' || r.media_type === 'tv')
    .map((r) =>
      media === 'tv' || r.media_type === 'tv' ? normalizeTvResult(r) : { ...r, mediaType: 'movie' as const }
    );
  return { ...data, results };
}

export async function getPopularMovies(page = 1): Promise<TmdbDiscoverResponse> {
  const res = await tmdbFetch(`${BASE_URL}/movie/popular?page=${page}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb popular movies failed: ${res.status}`);
  const data = await res.json();
  return {
    ...data,
    results: (data.results as Record<string, unknown>[]).map((r) => ({ ...r, mediaType: 'movie' as const })),
  };
}

export async function getPopularTv(page = 1): Promise<TmdbDiscoverResponse> {
  const res = await tmdbFetch(`${BASE_URL}/tv/popular?page=${page}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb popular TV failed: ${res.status}`);
  const data = await res.json();
  return {
    ...data,
    results: (data.results as Record<string, unknown>[]).map(normalizeTvResult),
  };
}

export async function getWatchProviders(
  id: number,
  mediaType: MediaType = 'movie',
  country = 'US'
): Promise<WatchProviders | null> {
  const res = await tmdbFetch(`${BASE_URL}/${mediaType}/${id}/watch/providers`, {
    headers: authHeaders(),
    next: { revalidate: 86400 },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[country] ?? null;
}

export async function discoverUpcoming({
  page = 1,
  genre = 'all',
  language = 'en',
  keywordIds = [],
}: {
  page?: number;
  genre?: number | string;
  language?: string;
  keywordIds?: number[];
} = {}): Promise<TmdbDiscoverResponse> {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonths = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    sort_by: 'primary_release_date.asc',
    'primary_release_date.gte': today,
    'primary_release_date.lte': sixMonths,
    'vote_count.gte': '0',
    page: String(page),
    include_adult: 'false',
  });
  if (genre !== 'all') params.set('with_genres', String(genre));
  if (language) params.set('with_original_language', language);
  if (keywordIds.length > 0) params.set('with_keywords', keywordIds.join('|'));

  const res = await tmdbFetch(`${BASE_URL}/discover/movie?${params}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb upcoming failed: ${res.status}`);
  return res.json();
}

export async function discoverUpcomingTv({
  page = 1,
  genre = 'all',
  language = 'en',
  keywordIds = [],
}: {
  page?: number;
  genre?: number | string;
  language?: string;
  keywordIds?: number[];
} = {}): Promise<TmdbDiscoverResponse> {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonths = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    sort_by: 'first_air_date.asc',
    'first_air_date.gte': today,
    'first_air_date.lte': sixMonths,
    'vote_count.gte': '0',
    page: String(page),
    include_adult: 'false',
  });
  if (genre !== 'all') params.set('with_genres', String(genre));
  if (language) params.set('with_original_language', language);
  if (keywordIds.length > 0) params.set('with_keywords', keywordIds.join('|'));

  const res = await tmdbFetch(`${BASE_URL}/discover/tv?${params}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb upcoming TV failed: ${res.status}`);
  const data = await res.json();
  return { ...data, results: data.results.map(normalizeTvResult) };
}

export async function discoverTv({
  page = 1,
  sortBy = 'vote_average.desc',
  minVotes = 50,
  dateGte,
  dateLte,
  language = 'en',
  genre = 10764,
  keywordIds = [],
}: {
  page?: number;
  sortBy?: string;
  minVotes?: number;
  dateGte?: string;
  dateLte?: string;
  language?: string;
  genre?: number | string;
  keywordIds?: number[];
}): Promise<TmdbDiscoverResponse> {
  // TV discover uses first_air_date, movies use release_date - translate
  const tvSortBy = sortBy
    .replace('release_date.desc', 'first_air_date.desc')
    .replace('release_date.asc', 'first_air_date.asc');

  const params = new URLSearchParams({
    sort_by: tvSortBy,
    'vote_count.gte': String(minVotes),
    page: String(page),
    include_adult: 'false',
  });
  if (genre !== 'all') params.set('with_genres', String(genre));

  if (language) params.set('with_original_language', language);
  if (keywordIds.length > 0) params.set('with_keywords', keywordIds.join('|'));
  if (dateGte) params.set('first_air_date.gte', dateGte);
  if (dateLte) params.set('first_air_date.lte', dateLte);

  const res = await tmdbFetch(`${BASE_URL}/discover/tv?${params}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb TV discover failed: ${res.status}`);
  const data = await res.json();
  return { ...data, results: data.results.map(normalizeTvResult) };
}

export interface TvSeasonsResult {
  seasons: { season_number: number; name: string; episode_count: number; air_date: string | null }[];
  /** Show premiere date - null means TMDB has no announced date at all. */
  firstAirDate: string | null;
  /** Air date of the next scheduled episode - present exactly when not everything has aired yet. */
  nextEpisodeAirDate: string | null;
}

export async function getTvSeasons(id: number): Promise<TvSeasonsResult> {
  const res = await tmdbFetch(`${BASE_URL}/tv/${id}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb TV seasons failed: ${res.status}`);
  const data = await res.json();
  return {
    seasons: ((data.seasons ?? []) as Record<string, unknown>[]).map((s) => ({
      season_number: s.season_number as number,
      name: s.name as string,
      episode_count: s.episode_count as number,
      air_date: (s.air_date as string) ?? null,
    })),
    firstAirDate: (data.first_air_date as string) || null,
    nextEpisodeAirDate: (data.next_episode_to_air?.air_date as string) ?? null,
  };
}

export async function getTvDetail(id: number): Promise<TmdbDetailResponse> {
  const res = await tmdbFetch(
    `${BASE_URL}/tv/${id}?append_to_response=keywords,external_ids,videos,recommendations,credits`,
    { headers: authHeaders(), next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error(`TMDb TV detail failed: ${res.status}`);
  const data = await res.json();
  // Normalize TV fields to match TmdbDetailResponse interface
  return {
    ...data,
    title: data.name ?? data.title,
    release_date: data.first_air_date ?? '',
    runtime: data.episode_run_time?.[0] ?? null,
    tagline: data.tagline ?? '',
    keywords: { keywords: data.keywords?.results ?? [] },
    // TV recommendations come back TV-shaped - normalize like searchTv does
    // so DocCard can render them (and link them to /tv/, not /documentary/).
    recommendations: {
      results: (data.recommendations?.results ?? []).map(normalizeTvResult),
    },
  };
}

/**
 * TMDB tv id for a TVDB id via /find - fills the gap when Sonarr's own
 * metadata lacks tmdbId (true for a handful of shows). Cached a week:
 * external-id mappings don't change.
 */
export async function findTvIdByTvdbId(tvdbId: number): Promise<number | null> {
  return findTvIdByExternalId(String(tvdbId), 'tvdb_id');
}

/** Same lookup keyed by IMDB id - the fallback when TMDB has no TVDB mapping for a show. */
export async function findTvIdByImdbId(imdbId: string): Promise<number | null> {
  return findTvIdByExternalId(imdbId, 'imdb_id');
}

/**
 * The reverse direction: a TMDB show's TVDB and IMDB ids. This is what lets
 * a request that started from a browse or search card (which only knows the
 * TMDB id) target the exact series in Sonarr instead of a title search -
 * "Big Brother" by title lands on whichever country's edition Sonarr lists
 * first. Never throws: a failed lookup just means falling back to title.
 */
export async function getTvExternalIds(tmdbId: number): Promise<{ tvdbId: number | null; imdbId: string | null }> {
  try {
    const res = await tmdbFetch(`${BASE_URL}/tv/${tmdbId}/external_ids`, {
      headers: authHeaders(),
      next: { revalidate: 604800 },
    });
    if (!res.ok) return { tvdbId: null, imdbId: null };
    const data = await res.json();
    return {
      tvdbId: typeof data.tvdb_id === 'number' && data.tvdb_id > 0 ? data.tvdb_id : null,
      imdbId: typeof data.imdb_id === 'string' && data.imdb_id ? data.imdb_id : null,
    };
  } catch {
    return { tvdbId: null, imdbId: null };
  }
}

async function findTvIdByExternalId(externalId: string, source: 'tvdb_id' | 'imdb_id'): Promise<number | null> {
  try {
    const res = await tmdbFetch(`${BASE_URL}/find/${externalId}?external_source=${source}`, {
      headers: authHeaders(),
      next: { revalidate: 604800 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.tv_results as { id: number }[] | undefined)?.[0]?.id ?? null;
  } catch {
    return null;
  }
}

export interface TmdbSeasonEpisode {
  episode_number: number;
  name: string;
  air_date: string | null;
}

/** One season's episode list - feeds the request modal's expanded season rows. Cached an hour like the detail fetches. */
export async function getTvSeasonEpisodes(tvId: number, seasonNumber: number): Promise<TmdbSeasonEpisode[]> {
  const res = await tmdbFetch(`${BASE_URL}/tv/${tvId}/season/${seasonNumber}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb season fetch failed: ${res.status}`);
  const data = await res.json();
  return ((data.episodes ?? []) as Record<string, unknown>[]).map((e) => ({
    episode_number: e.episode_number as number,
    name: (e.name as string) ?? `Episode ${e.episode_number as number}`,
    air_date: (e.air_date as string) ?? null,
  }));
}

// Talk shows and news carry hundreds of one-off "Self" appearances that
// bury a person's real work; they never belong on a filmography.
const NOISE_TV_GENRES = new Set([10767, 10763]);

/**
 * A person with their filmography, for /person/[id]. combined_credits mixes
 * movies and shows, cast and crew; one title can appear several times (an
 * actor who also produced), so credits collapse to one card per title.
 */
export async function getPerson(id: number): Promise<TmdbPerson> {
  const res = await tmdbFetch(`${BASE_URL}/person/${id}?append_to_response=combined_credits`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb person failed: ${res.status}`);
  const data = await res.json();
  const raw: Record<string, unknown>[] = [...(data.combined_credits?.cast ?? []), ...(data.combined_credits?.crew ?? [])];
  const seen = new Set<string>();
  const titles: TmdbMovie[] = [];
  const involvement = new Map<string, number>();
  for (const c of raw) {
    const mediaType = c.media_type === 'tv' ? 'tv' : c.media_type === 'movie' ? 'movie' : null;
    if (!mediaType) continue;
    const key = `${mediaType}:${c.id}`;
    if (seen.has(key)) continue;
    const genreIds = (c.genre_ids as number[] | undefined) ?? [];
    if (mediaType === 'tv' && genreIds.some((g) => NOISE_TV_GENRES.has(g))) continue;
    // A guest spot as themselves on someone else's show is not their work.
    const episodes = typeof c.episode_count === 'number' ? c.episode_count : null;
    if (mediaType === 'tv' && episodes !== null && episodes <= 2 && /self/i.test(String(c.character ?? ''))) continue;
    seen.add(key);
    titles.push(mediaType === 'tv' ? (normalizeTvResult(c) as TmdbMovie) : ({ ...c, mediaType: 'movie' } as TmdbMovie));
    // How much of the title was theirs: a series regular over a guest spot, a
    // lead over the tenth name. Only "Known for" uses this; the full lists
    // keep everything.
    const order = typeof c.order === 'number' ? c.order : 0;
    const share = mediaType === 'tv' ? Math.min(episodes ?? 1, 30) / 30 : 1 / (1 + order / 4);
    involvement.set(key, Math.max(involvement.get(key) ?? 0, share));
  }
  const byDate = (a: TmdbMovie, b: TmdbMovie) => (b.release_date || '').localeCompare(a.release_date || '');
  const withPoster = titles.filter((t) => t.poster_path);
  return {
    id: data.id,
    name: data.name,
    biography: data.biography ?? '',
    profile_path: data.profile_path ?? null,
    known_for_department: data.known_for_department ?? null,
    birthday: data.birthday ?? null,
    deathday: data.deathday ?? null,
    place_of_birth: data.place_of_birth ?? null,
    knownFor: [...withPoster]
      .sort((a, b) => (b.popularity ?? 0) * (involvement.get(`${b.mediaType}:${b.id}`) ?? 0) - (a.popularity ?? 0) * (involvement.get(`${a.mediaType}:${a.id}`) ?? 0))
      .slice(0, 10),
    movies: titles.filter((t) => t.mediaType === 'movie').sort(byDate),
    shows: titles.filter((t) => t.mediaType === 'tv').sort(byDate),
  };
}

/** A film series with its movies in release order, for /collection/[id]. */
export async function getCollection(id: number): Promise<TmdbCollection> {
  const res = await tmdbFetch(`${BASE_URL}/collection/${id}`, { headers: authHeaders(), next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`TMDb collection failed: ${res.status}`);
  const data = await res.json();
  const parts = ((data.parts ?? []) as Record<string, unknown>[])
    .map((p) => ({ ...p, mediaType: 'movie' as const }) as TmdbMovie)
    .sort((a, b) => (a.release_date || '9999').localeCompare(b.release_date || '9999'));
  return {
    id: data.id,
    name: data.name,
    overview: data.overview ?? '',
    poster_path: data.poster_path ?? null,
    backdrop_path: data.backdrop_path ?? null,
    parts,
  };
}

/**
 * Titles whose name contains the query, found through the credits of people
 * whose name matches it. TMDB's title search misses some entries outright:
 * "TYSON", a 2026 Netflix documentary, never appears for "tyson" even
 * though Mike Tyson's own credits list it. Only titles that carry the query
 * in their name are taken, so a search for a surname does not dump a whole
 * filmography into the results.
 */
export async function searchTitlesThroughPeople(query: string): Promise<TmdbMovie[]> {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const res = await tmdbFetch(`${BASE_URL}/search/person?query=${encodeURIComponent(query)}&include_adult=false`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) return [];
  const people = ((await res.json()).results ?? []) as { id: number; name?: string; popularity?: number }[];
  const matching = people.filter((p) => (p.name ?? '').toLowerCase().includes(q)).slice(0, 3);
  const out: TmdbMovie[] = [];
  const seen = new Set<string>();
  for (const person of matching) {
    const cr = await tmdbFetch(`${BASE_URL}/person/${person.id}/combined_credits`, { headers: authHeaders(), next: { revalidate: 3600 } });
    if (!cr.ok) continue;
    const data = await cr.json();
    for (const c of [...(data.cast ?? []), ...(data.crew ?? [])] as Record<string, unknown>[]) {
      const mediaType = c.media_type === 'tv' ? 'tv' : c.media_type === 'movie' ? 'movie' : null;
      if (!mediaType) continue;
      const title = String(c.title ?? c.name ?? '');
      if (!title.toLowerCase().includes(q)) continue;
      // Credits are full of decades-old fight broadcasts with no artwork; a
      // title earns a place only with a poster or a date in the last three
      // years (or ahead), which is what a search that missed it needs.
      const date = String(c.release_date ?? c.first_air_date ?? '');
      const recent = date >= new Date(Date.now() - 3 * 365.25 * 24 * 3600 * 1000).toISOString().slice(0, 10);
      if (!c.poster_path && !recent) continue;
      const key = `${mediaType}:${c.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(mediaType === 'tv' ? (normalizeTvResult(c) as TmdbMovie) : ({ ...c, mediaType: 'movie' } as TmdbMovie));
    }
  }
  return out;
}
