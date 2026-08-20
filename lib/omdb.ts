import { fetchWithTimeout } from './fetchTimeout';
import type { OmdbResponse } from '@/types';

const BASE_URL = 'https://www.omdbapi.com';

const OMDB_ENABLED = process.env.ENABLE_OMDB !== 'false';

export async function getOmdbData(imdbId: string): Promise<OmdbResponse | null> {
  if (!OMDB_ENABLED || !process.env.OMDB_API_KEY) return null;

  const params = new URLSearchParams({
    i: imdbId,
    apikey: process.env.OMDB_API_KEY,
  });

  const res = await fetchWithTimeout(`${BASE_URL}/?${params}`, {
    next: { revalidate: 86400 },
  });

  if (!res.ok) return null;

  const data: OmdbResponse = await res.json();
  if (data.Response === 'False') return null;

  return data;
}
