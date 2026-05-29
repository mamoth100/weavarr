import type { TmdbDetailResponse, TmdbDiscoverResponse, WatchProviders } from '@/types';
import type { MediaType } from '@/types';

const BASE_URL = 'https://api.themoviedb.org/3';

function authHeaders() {
  return {
    Authorization: `Bearer ${process.env.TMDB_TOKEN}`,
    'Content-Type': 'application/json',
  };
}

export const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

export async function discoverDocumentaries({
  page = 1,
  sortBy = 'vote_average.desc',
  keywordIds = [],
  minVotes = 50,
  dateGte,
  dateLte,
}: {
  page?: number;
  sortBy?: string;
  keywordIds?: number[];
  minVotes?: number;
  dateGte?: string;
  dateLte?: string;
}): Promise<TmdbDiscoverResponse> {
  const params = new URLSearchParams({
    with_genres: '99',
    sort_by: sortBy,
    'vote_count.gte': String(minVotes),
    page: String(page),
    include_adult: 'false',
  });

  if (keywordIds.length > 0) {
    // | = OR logic: matches any of the keyword IDs
    params.set('with_keywords', keywordIds.join('|'));
  }
  if (dateGte) params.set('primary_release_date.gte', dateGte);
  if (dateLte) params.set('primary_release_date.lte', dateLte);

  const res = await fetch(`${BASE_URL}/discover/movie?${params}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });

  if (!res.ok) throw new Error(`TMDb discover failed: ${res.status}`);
  return res.json();
}

export async function getDocumentaryDetail(id: number): Promise<TmdbDetailResponse> {
  const res = await fetch(
    `${BASE_URL}/movie/${id}?append_to_response=keywords,external_ids,videos`,
    { headers: authHeaders(), next: { revalidate: 3600 } }
  );
  if (!res.ok) throw new Error(`TMDb detail failed: ${res.status}`);
  return res.json();
}

export async function searchDocumentaries(
  query: string,
  page = 1
): Promise<TmdbDiscoverResponse> {
  const params = new URLSearchParams({
    query,
    page: String(page),
    include_adult: 'false',
  });

  const res = await fetch(`${BASE_URL}/search/movie?${params}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb search failed: ${res.status}`);
  return res.json();
}

export async function getWatchProviders(
  id: number,
  mediaType: MediaType = 'movie',
  country = 'US'
): Promise<WatchProviders | null> {
  const res = await fetch(`${BASE_URL}/${mediaType}/${id}/watch/providers`, {
    headers: authHeaders(),
    next: { revalidate: 86400 },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[country] ?? null;
}

export async function discoverUpcoming(page = 1, providerIds: number[] = []): Promise<TmdbDiscoverResponse> {
  const today = new Date().toISOString().slice(0, 10);
  const sixMonths = new Date(Date.now() + 1000 * 60 * 60 * 24 * 180).toISOString().slice(0, 10);
  const params = new URLSearchParams({
    with_genres: '99',
    sort_by: 'primary_release_date.asc',
    'primary_release_date.gte': today,
    'primary_release_date.lte': sixMonths,
    'vote_count.gte': '0',
    page: String(page),
    include_adult: 'false',
  });
  if (providerIds.length > 0) {
    params.set('with_watch_providers', providerIds.join('|'));
    params.set('watch_region', 'US');
  }
  const res = await fetch(`${BASE_URL}/discover/movie?${params}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb upcoming failed: ${res.status}`);
  return res.json();
}

export async function discoverTv({
  page = 1,
  sortBy = 'vote_average.desc',
  minVotes = 50,
  dateGte,
  dateLte,
}: {
  page?: number;
  sortBy?: string;
  minVotes?: number;
  dateGte?: string;
  dateLte?: string;
}): Promise<TmdbDiscoverResponse> {
  // TV discover uses first_air_date, movies use release_date — translate
  const tvSortBy = sortBy
    .replace('release_date.desc', 'first_air_date.desc')
    .replace('release_date.asc', 'first_air_date.asc');

  const params = new URLSearchParams({
    with_genres: '10764',
    sort_by: tvSortBy,
    'vote_count.gte': String(minVotes),
    page: String(page),
    include_adult: 'false',
  });

  if (dateGte) params.set('first_air_date.gte', dateGte);
  if (dateLte) params.set('first_air_date.lte', dateLte);

  const res = await fetch(`${BASE_URL}/discover/tv?${params}`, {
    headers: authHeaders(),
    next: { revalidate: 3600 },
  });
  if (!res.ok) throw new Error(`TMDb TV discover failed: ${res.status}`);
  const data = await res.json();
  // Normalize TV fields to match TmdbMovie interface
  return {
    ...data,
    results: data.results.map((show: Record<string, unknown>) => ({
      ...show,
      title: (show.name as string) ?? show.title,
      release_date: (show.first_air_date as string) ?? show.release_date ?? '',
    })),
  };
}

export async function getTvDetail(id: number): Promise<TmdbDetailResponse> {
  const res = await fetch(
    `${BASE_URL}/tv/${id}?append_to_response=keywords,external_ids,videos`,
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
  };
}
