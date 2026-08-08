const BASE_URL = 'https://api.trakt.tv';

const TRAKT_ENABLED = process.env.ENABLE_TRAKT !== 'false';

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

export interface TraktData {
  ratings: TraktRatings | null;
  stats: TraktStats | null;
}

function traktHeaders() {
  return {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': process.env.TRAKT_CLIENT_ID!,
  };
}

/** Resolve the Trakt type+slug for any IMDb ID (movie or show) */
async function resolveTraktItem(
  imdbId: string
): Promise<{ type: string; slug: string } | null> {
  // Fast path: try direct movie lookup
  const direct = await fetch(`${BASE_URL}/movies/${imdbId}`, {
    headers: traktHeaders(),
    cache: 'no-store',
  });
  if (direct.ok) {
    const data = await direct.json();
    const slug = data.ids?.slug;
    if (slug) return { type: 'movies', slug };
  }

  // Fallback: search by IMDb ID (finds movies AND shows)
  const search = await fetch(`${BASE_URL}/search/imdb/${imdbId}`, {
    headers: traktHeaders(),
    cache: 'no-store',
  });
  if (!search.ok) return null;

  const results: Array<{ type: string; movie?: { ids: { slug: string } }; show?: { ids: { slug: string } } }> =
    await search.json();
  if (!results.length) return null;

  const first = results[0];
  const mediaType = first.type === 'show' ? 'shows' : 'movies';
  const slug = (first.movie ?? first.show)?.ids?.slug;
  if (!slug) return null;

  return { type: mediaType, slug };
}

/** Fetch both ratings and stats for an IMDb ID in one resolved lookup */
export async function getTraktData(imdbId: string): Promise<TraktData> {
  if (!TRAKT_ENABLED || !process.env.TRAKT_CLIENT_ID) return { ratings: null, stats: null };

  const item = await resolveTraktItem(imdbId);
  if (!item) return { ratings: null, stats: null };

  const [ratingsRes, statsRes] = await Promise.all([
    fetch(`${BASE_URL}/${item.type}/${item.slug}/ratings`, {
      headers: traktHeaders(),
      cache: 'no-store',
    }),
    fetch(`${BASE_URL}/${item.type}/${item.slug}/stats`, {
      headers: traktHeaders(),
      cache: 'no-store',
    }),
  ]);

  const ratings: TraktRatings | null = ratingsRes.ok ? await ratingsRes.json() : null;
  const stats: TraktStats | null = statsRes.ok ? await statsRes.json() : null;

  return { ratings, stats };
}

// Keep legacy exports for backward compatibility
export async function getTraktRatings(imdbId: string): Promise<TraktRatings | null> {
  const { ratings } = await getTraktData(imdbId);
  return ratings;
}

export async function getTraktStats(imdbId: string): Promise<TraktStats | null> {
  const { stats } = await getTraktData(imdbId);
  return stats;
}
