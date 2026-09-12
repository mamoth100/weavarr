/**
 * Keeps "watched" status in sync between Plex and Jellyfin - if either one
 * has a movie or episode marked watched (by playback or a manual mark, it
 * makes no difference to either server), the other gets marked watched too.
 * One-way-forward only: nothing here ever un-marks a watched item, and once
 * a title/episode has been reconciled it's remembered so it isn't re-checked
 * (and re-written) on every poll.
 *
 * Matching is by provider id (TMDB, then IMDB, then TVDB), with normalized
 * title as a last resort - the two servers routinely display different names
 * for the same item ("The Empire Strikes Back" vs "Star Wars: Episode V -
 * The Empire Strikes Back"), so title comparison alone permanently failed
 * for those and logged an error every cycle.
 */
import { mkdir, readFile, writeFile, rename } from 'fs/promises';
import path from 'path';
import {
  getPlexEpisodeWatchHistory,
  getAllPlexMoviesWithIds,
  getAllPlexShowsWithIds,
  markPlexRatingKeyWatched,
  markPlexShowEpisodesWatchedByKey,
  type PlexLibraryItem,
} from './plex';
import {
  getJellyfinEpisodeWatchHistory,
  getAllJellyfinMoviesWithIds,
  getAllJellyfinShowsWithIds,
  markJellyfinItemWatched,
  markJellyfinSeriesEpisodesWatchedById,
  type JellyfinLibraryItem,
} from './jellyfin';
import { titlesMatch } from './titleMatch';

const STATE_FILE = path.join(process.cwd(), 'data', 'watched-sync-state.json');
// 500 silently missed anything older in a large watch history (found live -
// a Plex episode ranked #757 by lastViewedAt never reconciled because it
// fell outside the window on every single poll). 2000 matches the limit
// app/api/calendar/route.ts already uses against the same endpoints.
const HISTORY_LIMIT = 2000;

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

// Server-agnostic view of a library item: `serverKey` is whatever that server
// needs to act on it later (Plex ratingKey / Jellyfin item id).
interface LibItem {
  serverKey: string;
  title: string;
  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  watched: boolean;
}

function fromPlex(i: PlexLibraryItem): LibItem {
  return { serverKey: i.ratingKey, title: i.title, tmdbId: i.tmdbId, imdbId: i.imdbId, tvdbId: i.tvdbId, watched: i.watched };
}

function fromJellyfin(i: JellyfinLibraryItem): LibItem {
  return { serverKey: i.id, title: i.title, tmdbId: i.tmdbId, imdbId: i.imdbId, tvdbId: i.tvdbId, watched: i.watched };
}

/**
 * Stable identity for the seen-state file, independent of which server the
 * item came from - both servers carry the same TMDB/IMDB/TVDB ids even when
 * their display titles disagree. (Keys written by the old title-based format
 * stay in the file harmlessly; those items re-reconcile once - a no-op mark
 * at worst - and get re-remembered under their id key.)
 */
function canonical(i: LibItem): string {
  if (i.tmdbId) return `tmdb:${i.tmdbId}`;
  if (i.imdbId) return `imdb:${i.imdbId}`;
  if (i.tvdbId) return `tvdb:${i.tvdbId}`;
  return `title:${norm(i.title)}`;
}

interface LibIndex {
  byTmdb: Map<number, LibItem>;
  byImdb: Map<string, LibItem>;
  byTvdb: Map<number, LibItem>;
  all: LibItem[];
}

function buildIndex(items: LibItem[]): LibIndex {
  const idx: LibIndex = { byTmdb: new Map(), byImdb: new Map(), byTvdb: new Map(), all: items };
  for (const i of items) {
    if (i.tmdbId) idx.byTmdb.set(i.tmdbId, i);
    if (i.imdbId) idx.byImdb.set(i.imdbId, i);
    if (i.tvdbId) idx.byTvdb.set(i.tvdbId, i);
  }
  return idx;
}

/** The other server's copy of this item: provider ids first, strict title match as the fallback for items missing ids on either side. */
function findMatch(source: LibItem, target: LibIndex): LibItem | undefined {
  if (source.tmdbId && target.byTmdb.has(source.tmdbId)) return target.byTmdb.get(source.tmdbId);
  if (source.imdbId && target.byImdb.has(source.imdbId)) return target.byImdb.get(source.imdbId);
  if (source.tvdbId && target.byTvdb.has(source.tvdbId)) return target.byTvdb.get(source.tvdbId);
  return target.all.find((t) => titlesMatch(t.title, source.title));
}

// Each reconcile can be its own round-trip to Plex or Jellyfin - running a
// large first-time backlog one at a time took minutes. A small worker pool
// keeps it fast without hammering either server.
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

export async function syncWatchedBetweenServers(): Promise<number> {
  const seen = await loadSynced();
  let changed = false;
  let sinceFlush = 0;
  let marks = 0;

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

  const [plexMoviesR, jellyfinMoviesR, plexShowsR, jellyfinShowsR, plexEpsR, jellyfinEpsR] = await Promise.allSettled([
    getAllPlexMoviesWithIds(),
    getAllJellyfinMoviesWithIds(),
    getAllPlexShowsWithIds(),
    getAllJellyfinShowsWithIds(),
    getPlexEpisodeWatchHistory(HISTORY_LIMIT),
    getJellyfinEpisodeWatchHistory(HISTORY_LIMIT),
  ]);

  const plexMovies = (plexMoviesR.status === 'fulfilled' ? plexMoviesR.value : []).map(fromPlex);
  const jellyfinMovies = (jellyfinMoviesR.status === 'fulfilled' ? jellyfinMoviesR.value : []).map(fromJellyfin);
  const plexShows = (plexShowsR.status === 'fulfilled' ? plexShowsR.value : []).map(fromPlex);
  const jellyfinShows = (jellyfinShowsR.status === 'fulfilled' ? jellyfinShowsR.value : []).map(fromJellyfin);
  const plexEps = plexEpsR.status === 'fulfilled' ? plexEpsR.value : [];
  const jellyfinEps = jellyfinEpsR.status === 'fulfilled' ? jellyfinEpsR.value : [];

  // A failed library listing must not look like an empty library - reconciling
  // against "nothing" would log a spurious not-found error for every watched
  // item on the other side.
  const plexMoviesOk = plexMoviesR.status === 'fulfilled';
  const jellyfinMoviesOk = jellyfinMoviesR.status === 'fulfilled';
  const plexShowsOk = plexShowsR.status === 'fulfilled';
  const jellyfinShowsOk = jellyfinShowsR.status === 'fulfilled';

  const plexMovieIdx = buildIndex(plexMovies);
  const jellyfinMovieIdx = buildIndex(jellyfinMovies);
  const plexShowIdx = buildIndex(plexShows);
  const jellyfinShowIdx = buildIndex(jellyfinShows);

  const plexShowsByTitle = new Map(plexShows.map((s) => [norm(s.title), s]));
  const jellyfinShowsByTitle = new Map(jellyfinShows.map((s) => [norm(s.title), s]));

  async function reconcileMovie(
    movie: LibItem,
    targetIdx: LibIndex,
    markTarget: (serverKey: string) => Promise<void>,
    direction: string
  ) {
    const key = `movie:${canonical(movie)}`;
    if (seen.has(key)) return;
    const match = findMatch(movie, targetIdx);
    if (!match) {
      console.error(`[watchedSync] failed to sync "${movie.title}" ${direction}: not in the other library`);
      return;
    }
    if (match.watched) {
      seen.add(key);
      await markDirty();
      return;
    }
    try {
      await markTarget(match.serverKey);
      seen.add(key);
      await markDirty();
      marks += 1;
      console.log(`[watchedSync] marked "${movie.title}" watched ${direction}`);
    } catch (err) {
      console.error(`[watchedSync] failed to sync "${movie.title}" ${direction}:`, err instanceof Error ? err.message : err);
    }
  }

  // Episode identity uses the show's canonical id - both servers' watch
  // histories collapse onto the same key even when the show display names
  // differ. Shows missing from their own library listing (e.g. history rows
  // for a since-deleted show) fall back to the title.
  function epKey(ownShow: LibItem | undefined, showTitle: string, seasonNumber: number, episodeNumber: number): string {
    const base = ownShow ? canonical(ownShow) : `title:${norm(showTitle)}`;
    return `ep:${base}:${seasonNumber}:${episodeNumber}`;
  }

  const jellyfinEpSet = new Set(
    jellyfinEps.map((e) => epKey(jellyfinShowsByTitle.get(norm(e.showTitle)), e.showTitle, e.seasonNumber, e.episodeNumber))
  );
  const plexEpSet = new Set(
    plexEps.map((e) => epKey(plexShowsByTitle.get(norm(e.showTitle)), e.showTitle, e.seasonNumber, e.episodeNumber))
  );

  async function reconcileEpisode(
    ep: { showTitle: string; seasonNumber: number; episodeNumber: number; viewedAt?: string },
    ownShowsByTitle: Map<string, LibItem>,
    targetEpSet: Set<string>,
    targetShowIdx: LibIndex,
    // The fourth argument is the original watch date. Jellyfin honours it;
    // Plex has no way to set one, so its mark function simply ignores it.
    markTargetEpisodes: (showServerKey: string, eps: { seasonNumber: number; episodeNumber: number }[], showTitle: string, viewedAt?: string) => Promise<void>,
    direction: string
  ) {
    const ownShow = ownShowsByTitle.get(norm(ep.showTitle));
    const key = epKey(ownShow, ep.showTitle, ep.seasonNumber, ep.episodeNumber);
    if (seen.has(key)) return;
    if (targetEpSet.has(key)) {
      seen.add(key);
      await markDirty();
      return;
    }
    const targetShow = ownShow
      ? findMatch(ownShow, targetShowIdx)
      : targetShowIdx.all.find((t) => titlesMatch(t.title, ep.showTitle));
    if (!targetShow) {
      console.error(`[watchedSync] failed to sync "${ep.showTitle}" S${ep.seasonNumber}E${ep.episodeNumber} ${direction}: show not in the other library`);
      return;
    }
    try {
      await markTargetEpisodes(targetShow.serverKey, [{ seasonNumber: ep.seasonNumber, episodeNumber: ep.episodeNumber }], ep.showTitle, ep.viewedAt);
      seen.add(key);
      await markDirty();
      marks += 1;
      console.log(`[watchedSync] marked "${ep.showTitle}" S${ep.seasonNumber}E${ep.episodeNumber} watched ${direction}`);
    } catch (err) {
      console.error(`[watchedSync] failed to sync "${ep.showTitle}" S${ep.seasonNumber}E${ep.episodeNumber} ${direction}:`, err instanceof Error ? err.message : err);
    }
  }

  await Promise.all([
    jellyfinMoviesOk
      ? mapWithConcurrency(plexMovies.filter((m) => m.watched), (m) =>
          reconcileMovie(m, jellyfinMovieIdx, markJellyfinItemWatched, '(Plex → Jellyfin)')
        )
      : Promise.resolve(),
    plexMoviesOk
      ? mapWithConcurrency(jellyfinMovies.filter((m) => m.watched), (m) =>
          reconcileMovie(m, plexMovieIdx, markPlexRatingKeyWatched, '(Jellyfin → Plex)')
        )
      : Promise.resolve(),
    jellyfinShowsOk
      ? mapWithConcurrency(plexEps, (e) =>
          reconcileEpisode(e, plexShowsByTitle, jellyfinEpSet, jellyfinShowIdx, markJellyfinSeriesEpisodesWatchedById, '(Plex → Jellyfin)')
        )
      : Promise.resolve(),
    plexShowsOk
      ? mapWithConcurrency(jellyfinEps, (e) =>
          reconcileEpisode(e, jellyfinShowsByTitle, plexEpSet, plexShowIdx, markPlexShowEpisodesWatchedByKey, '(Jellyfin → Plex)')
        )
      : Promise.resolve(),
  ]);

  if (changed) await persistSynced();
  return marks;
}
