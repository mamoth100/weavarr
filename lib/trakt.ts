const BASE_URL = 'https://api.trakt.tv';

export interface TraktRatings {
  rating: number;
  votes: number;
}

export interface TraktStats {
  watchers: number;
  plays: number;
  collectors: number;
  lists: number;
}

function traktHeaders() {
  return {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': process.env.TRAKT_CLIENT_ID!,
  };
}

export async function getTraktRatings(
  imdbId: string
): Promise<TraktRatings | null> {
  if (!process.env.TRAKT_CLIENT_ID) return null;

  const res = await fetch(`${BASE_URL}/movies/${imdbId}/ratings`, {
    headers: traktHeaders(),
    next: { revalidate: 3600 },
  });

  if (!res.ok) return null;
  return res.json();
}

export async function getTraktStats(
  imdbId: string
): Promise<TraktStats | null> {
  if (!process.env.TRAKT_CLIENT_ID) return null;

  const res = await fetch(`${BASE_URL}/movies/${imdbId}/stats`, {
    headers: traktHeaders(),
    next: { revalidate: 3600 },
  });

  if (!res.ok) return null;
  return res.json();
}
