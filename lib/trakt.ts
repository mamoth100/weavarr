import { fetchWithTimeout } from './fetchTimeout';
import { getRawEnvValue } from './settings';

/**
 * Trakt ratings, fetched on the server. They used to be fetched by the
 * browser because Trakt's edge once refused server calls; that is no longer
 * the case (confirmed from the container 2026-09-15), and the browser route
 * needed every address the app is opened at to be registered as a CORS
 * origin on the Trakt app, which nobody did. Fetching here needs nothing
 * but the client id.
 */

export interface TraktRating {
  rating: number;
  votes: number;
  watchers: number | null;
}

/** The rating half alone, as the composite score takes it. */
export type TraktRatings = Pick<TraktRating, 'rating' | 'votes'>;

const TRAKT_HEADERS_BASE = { 'trakt-api-version': '2', 'User-Agent': 'Weavarr/1.0' };

// Ratings change slowly; one call per title per hour is plenty and keeps a
// browse session from hammering Trakt.
const CACHE_MS = 60 * 60 * 1000;
const cache = new Map<string, { at: number; value: TraktRating | null }>();

/** The client id saved in Settings (live, no restart needed), or the boot-time env as a fallback; empty when Trakt is disabled. */
export async function traktClientId(): Promise<string> {
  const enabled = ((await getRawEnvValue('ENABLE_TRAKT')) ?? process.env.ENABLE_TRAKT ?? 'true') !== 'false';
  if (!enabled) return '';
  return ((await getRawEnvValue('TRAKT_CLIENT_ID')) ?? process.env.TRAKT_CLIENT_ID ?? '').trim();
}

function headers(clientId: string) {
  return { ...TRAKT_HEADERS_BASE, 'trakt-api-key': clientId };
}

/** Rating, votes and current watchers for an IMDb id, or null when Trakt does not know it (or is not configured). Cached an hour. */
export async function getTraktRating(imdbId: string): Promise<TraktRating | null> {
  const hit = cache.get(imdbId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const clientId = await traktClientId();
  if (!clientId) return null;
  const h = headers(clientId);

  // Search resolves the IMDb id to Trakt's own slug and tells us whether it
  // is a movie or a show, so the right ratings endpoint is asked.
  const searchRes = await fetchWithTimeout(`https://api.trakt.tv/search/imdb/${encodeURIComponent(imdbId)}?type=movie,show`, {
    headers: h,
    cache: 'no-store',
  });
  if (!searchRes.ok) throw new Error(`Trakt search failed: HTTP ${searchRes.status}`);
  const results = (await searchRes.json()) as { type?: string; movie?: { ids?: { slug?: string } }; show?: { ids?: { slug?: string } } }[];
  const first = results.find((r) => r.type === 'movie' || r.type === 'show');
  const slug = (first?.movie ?? first?.show)?.ids?.slug;
  const type = first?.type === 'show' ? 'shows' : 'movies';

  let value: TraktRating | null = null;
  if (slug) {
    const [ratingsRes, statsRes] = await Promise.all([
      fetchWithTimeout(`https://api.trakt.tv/${type}/${slug}/ratings`, { headers: h, cache: 'no-store' }),
      fetchWithTimeout(`https://api.trakt.tv/${type}/${slug}/stats`, { headers: h, cache: 'no-store' }),
    ]);
    // 204 means Trakt has the title but nobody has rated it.
    if (ratingsRes.status === 200) {
      const ratings = (await ratingsRes.json()) as { rating?: number; votes?: number };
      const stats = statsRes.status === 200 ? ((await statsRes.json()) as { watchers?: number }) : null;
      if (typeof ratings.rating === 'number' && typeof ratings.votes === 'number') {
        value = { rating: ratings.rating, votes: ratings.votes, watchers: stats?.watchers ?? null };
      }
    }
  }
  cache.set(imdbId, { at: Date.now(), value });
  return value;
}
