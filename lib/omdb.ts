import type { OmdbResponse } from '@/types';

const BASE_URL = 'https://www.omdbapi.com';

export async function getOmdbData(imdbId: string): Promise<OmdbResponse | null> {
  const params = new URLSearchParams({
    i: imdbId,
    apikey: process.env.OMDB_API_KEY!,
  });

  const res = await fetch(`${BASE_URL}/?${params}`, {
    next: { revalidate: 86400 },
  });

  if (!res.ok) return null;

  const data: OmdbResponse = await res.json();
  if (data.Response === 'False') return null;

  return data;
}
