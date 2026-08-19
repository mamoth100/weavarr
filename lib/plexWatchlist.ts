/**
 * Plex Watchlist sync (Seerr parity, roadmap Tier 1): anything added to the
 * Plex account's watchlist - from ANY Plex app, couch included - gets added
 * to Radarr (movies) or Sonarr (shows) automatically.
 *
 * Deliberately OPT-IN (ENABLE_PLEX_WATCHLIST_SYNC, default off): this is
 * auto-acquisition, and nobody should discover their watchlist emptied a
 * 4TB drive because a toggle defaulted on.
 *
 * Uses the plex.tv metadata provider with the account token (the same token
 * the PIN sign-in stores). Processed items are remembered by ratingKey in
 * data/watchlist-sync-state.json so removing something from Radarr later
 * doesn't get it silently re-added on the next poll.
 */
import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { addMovieToRadarr } from './radarr';
import { addSeriesToSonarr } from './sonarr';

const STATE_FILE = path.join(process.cwd(), 'data', 'watchlist-sync-state.json');
const PROVIDER = 'https://metadata.provider.plex.tv';

export function plexWatchlistSyncEnabled(): boolean {
  return process.env.ENABLE_PLEX_WATCHLIST_SYNC === 'true' && Boolean(process.env.PLEX_TOKEN);
}

function headers() {
  return { Accept: 'application/json', 'X-Plex-Token': process.env.PLEX_TOKEN as string };
}

export interface WatchlistItem {
  ratingKey: string;
  title: string;
  type: 'movie' | 'show';
  year?: number;
}

export async function getPlexWatchlist(): Promise<WatchlistItem[]> {
  const res = await fetch(`${PROVIDER}/library/sections/watchlist/all`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex watchlist fetch failed: ${res.status}`);
  const data = await res.json();
  const items: Record<string, unknown>[] = data.MediaContainer?.Metadata ?? [];
  return items
    .filter((i) => i.type === 'movie' || i.type === 'show')
    .map((i) => ({
      ratingKey: String(i.ratingKey),
      title: (i.title as string) ?? 'Unknown',
      type: i.type as 'movie' | 'show',
      year: i.year as number | undefined,
    }));
}

/** The tmdb/imdb ids for one watchlist item - requires a second per-item metadata fetch; the listing itself doesn't carry Guids. */
export async function getWatchlistItemIds(ratingKey: string): Promise<{ tmdbId: number | null; imdbId: string | null }> {
  const res = await fetch(`${PROVIDER}/library/metadata/${encodeURIComponent(ratingKey)}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex watchlist metadata failed: ${res.status}`);
  const data = await res.json();
  const guids: { id?: string }[] = data.MediaContainer?.Metadata?.[0]?.Guid ?? [];
  let tmdbId: number | null = null;
  let imdbId: string | null = null;
  for (const g of guids) {
    if (g.id?.startsWith('tmdb://')) tmdbId = Number(g.id.slice('tmdb://'.length)) || null;
    if (g.id?.startsWith('imdb://')) imdbId = g.id.slice('imdb://'.length) || null;
  }
  return { tmdbId, imdbId };
}

async function loadProcessed(): Promise<Set<string>> {
  try {
    return new Set(JSON.parse(await readFile(STATE_FILE, 'utf8')));
  } catch {
    return new Set();
  }
}

async function saveProcessed(processed: Set<string>): Promise<void> {
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  const tmp = `${STATE_FILE}.tmp`;
  await writeFile(tmp, JSON.stringify(Array.from(processed)), 'utf8');
  const { rename } = await import('fs/promises');
  await rename(tmp, STATE_FILE);
}

export async function syncPlexWatchlist(): Promise<void> {
  if (!plexWatchlistSyncEnabled()) return;

  const [items, processed] = await Promise.all([getPlexWatchlist(), loadProcessed()]);
  const fresh = items.filter((i) => !processed.has(i.ratingKey));
  if (fresh.length === 0) return;

  let changed = false;
  for (const item of fresh) {
    try {
      const { tmdbId, imdbId } = await getWatchlistItemIds(item.ratingKey);
      if (item.type === 'movie') {
        if (!tmdbId) throw new Error('no TMDB id on watchlist item');
        const result = await addMovieToRadarr(tmdbId, false, undefined, 'watchlist');
        console.log(
          `[watchlistSync] "${item.title}"${item.year ? ` (${item.year})` : ''} ${result.alreadyAdded ? 'already in Radarr' : 'added to Radarr'}`
        );
      } else {
        const result = await addSeriesToSonarr({ imdbId, title: item.title, source: 'watchlist' });
        console.log(
          `[watchlistSync] "${item.title}"${item.year ? ` (${item.year})` : ''} ${result.alreadyAdded ? 'already in Sonarr' : 'added to Sonarr'}`
        );
      }
      processed.add(item.ratingKey);
      changed = true;
    } catch (err) {
      // Not marked processed - retried next poll. Logged so the Logs tab shows it.
      console.error(
        `[watchlistSync] failed to add "${item.title}":`,
        err instanceof Error ? err.message : err
      );
    }
  }

  if (changed) await saveProcessed(processed);
}
