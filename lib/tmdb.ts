import type { TmdbDetailResponse, TmdbDiscoverResponse, WatchProviders } from '@/types';

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
    `${BASE_URL}/movie/${id}?append_to_response=keywords,external_ids`,
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
  country = 'US'
): Promise<WatchProviders | null> {
  const res = await fetch(`${BASE_URL}/movie/${id}/watch/providers`, {
    headers: authHeaders(),
    next: { revalidate: 86400 },
  });

  if (!res.ok) return null;
  const data = await res.json();
  return data.results?.[country] ?? null;
}
