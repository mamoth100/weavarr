/**
 * Keeps "watched" status in sync between Plex and Jellyfin - if either one
 * has a movie or episode marked watched (by playback or a manual mark, it
 * makes no difference to either server), the other gets marked watched too.
 * One-way-forward only: nothing here ever un-marks a watched item, and once
 * a title/episode has been reconciled it's remembered so it isn't re-checked
 * (and re-written) on every poll.
 */
import { mkdir, readFile, writeFile, rename } from 'fs/promises';
import path from 'path';
import { getPlexWatchedMovies, getPlexEpisodeWatchHistory, markPlexMovieWatched, markPlexEpisodesWatched } from './plex';
import { getJellyfinWatchedMovies, getJellyfinEpisodeWatchHistory, markJellyfinMovieWatched, markJellyfinEpisodesWatched } from './jellyfin';

const STATE_FILE = path.join(process.cwd(), 'data', 'watched-sync-state.json');
const HISTORY_LIMIT = 500;

let synced: Set<string> | null = null;

async function loadSynced(): Promise<Set<string>> {
  if (synced) return synced;
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    synced = new Set(JSON.parse(raw));
  } catch {
    synced = new Set();
  }
  return synced;
}

// Serialized + atomic: persistSynced fires from up to 8 concurrent workers
// (markDirty flushes every 20 reconciliations across four pools). Overlapping
// plain writeFile calls to the same path can interleave into invalid JSON,
// which loadSynced then silently swallows - restarting the entire backlog.
let persistChain: Promise<void> = Promise.resolve();

function persistSynced(): Promise<void> {
  const run = persistChain.then(async () => {
    if (!synced) return;
    await mkdir(path.dirname(STATE_FILE), { recursive: true });
    const tmp = `${STATE_FILE}.tmp`;
    await writeFile(tmp, JSON.stringify(Array.from(synced)), 'utf8');
    await rename(tmp, STATE_FILE);
  });
  persistChain = run.catch(() => {});
  return run;
}

function norm(title: string): string {
  return title.toLowerCase().trim();
}

// Each reconcile is its own round-trip to Plex or Jellyfin (search + mark) -
// running the whole backlog one at a time took minutes on the first sync.
// A small worker pool keeps it fast without hammering either server with
// hundreds of simultaneous requests.
const CONCURRENCY = 8;

async function mapWithConcurrency<T>(items: T[], fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  async function worker() {
    let item: T | undefined;
    while ((item = queue.shift()) !== undefined) {
      await fn(item);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, items.length) }, () => worker()));
}

export async function syncWatchedBetweenServers(): Promise<void> {
  const seen = await loadSynced();
  let changed = false;
  let sinceFlush = 0;

  // A large first-time backlog can take a while even with concurrency - flush
  // progress periodically instead of only at the very end, so a killed or
  // crashed run doesn't lose everything it already reconciled.
  async function markDirty() {
    changed = true;
    sinceFlush += 1;
    if (sinceFlush >= 20) {
      sinceFlush = 0;
      await persistSynced();
    }
  }

  const [plexMoviesR, jellyfinMoviesR, plexEpsR, jellyfinEpsR] = await Promise.allSettled([
    getPlexWatchedMovies(),
    getJellyfinWatchedMovies(),
    getPlexEpisodeWatchHistory(HISTORY_LIMIT),
    getJellyfinEpisodeWatchHistory(HISTORY_LIMIT),
  ]);

  const plexMovies = plexMoviesR.status === 'fulfilled' ? plexMoviesR.value : [];
  const jellyfinMovies = jellyfinMoviesR.status === 'fulfilled' ? jellyfinMoviesR.value : [];
  const plexEps = plexEpsR.status === 'fulfilled' ? plexEpsR.value : [];
  const jellyfinEps = jellyfinEpsR.status === 'fulfilled' ? jellyfinEpsR.value : [];

  const jellyfinMovieSet = new Set(jellyfinMovies.map((m) => norm(m.title)));
  const plexMovieSet = new Set(plexMovies.map((m) => norm(m.title)));
  const jellyfinEpSet = new Set(jellyfinEps.map((e) => `${norm(e.showTitle)}:${e.seasonNumber}:${e.episodeNumber}`));
  const plexEpSet = new Set(plexEps.map((e) => `${norm(e.showTitle)}:${e.seasonNumber}:${e.episodeNumber}`));

  async function reconcileMovie(title: string, alreadyMatches: boolean, markOnOther: (t: string) => Promise<void>, direction: string) {
    const key = `movie:${norm(title)}`;
    if (seen.has(key)) return;
    if (alreadyMatches) {
      seen.add(key);
      await markDirty();
      return;
    }
    try {
      await markOnOther(title);
      seen.add(key);
      await markDirty();
      console.log(`[watchedSync] marked "${title}" watched ${direction}`);
    } catch (err) {
      console.error(`[watchedSync] failed to sync "${title}" ${direction}:`, err instanceof Error ? err.message : err);
    }
  }

  async function reconcileEpisode(
    showTitle: string,
    seasonNumber: number,
    episodeNumber: number,
    alreadyMatches: boolean,
    markOnOther: (t: string, eps: { seasonNumber: number; episodeNumber: number }[]) => Promise<void>,
    direction: string
  ) {
    const epKey = `${norm(showTitle)}:${seasonNumber}:${episodeNumber}`;
    const key = `ep:${epKey}`;
    if (seen.has(key)) return;
    if (alreadyMatches) {
      seen.add(key);
      await markDirty();
      return;
    }
    try {
      await markOnOther(showTitle, [{ seasonNumber, episodeNumber }]);
      seen.add(key);
      await markDirty();
      console.log(`[watchedSync] marked "${showTitle}" S${seasonNumber}E${episodeNumber} watched ${direction}`);
    } catch (err) {
      console.error(`[watchedSync] failed to sync "${showTitle}" S${seasonNumber}E${episodeNumber} ${direction}:`, err instanceof Error ? err.message : err);
    }
  }

  await Promise.all([
    mapWithConcurrency(plexMovies, (m) =>
      reconcileMovie(m.title, jellyfinMovieSet.has(norm(m.title)), markJellyfinMovieWatched, '(Plex → Jellyfin)')
    ),
    mapWithConcurrency(jellyfinMovies, (m) =>
      reconcileMovie(m.title, plexMovieSet.has(norm(m.title)), markPlexMovieWatched, '(Jellyfin → Plex)')
    ),
    mapWithConcurrency(plexEps, (e) =>
      reconcileEpisode(
        e.showTitle, e.seasonNumber, e.episodeNumber,
        jellyfinEpSet.has(`${norm(e.showTitle)}:${e.seasonNumber}:${e.episodeNumber}`),
        markJellyfinEpisodesWatched, '(Plex → Jellyfin)'
      )
    ),
    mapWithConcurrency(jellyfinEps, (e) =>
      reconcileEpisode(
        e.showTitle, e.seasonNumber, e.episodeNumber,
        plexEpSet.has(`${norm(e.showTitle)}:${e.seasonNumber}:${e.episodeNumber}`),
        markPlexEpisodesWatched, '(Jellyfin → Plex)'
      )
    ),
  ]);

  if (changed) await persistSynced();
}
