/**
 * Keeps "watched" status in sync between Plex and Jellyfin - if either one
 * has a movie or episode marked watched (by playback or a manual mark, it
 * makes no difference to either server), the other gets marked watched too.
 * One-way-forward only: nothing here ever un-marks a watched item, and once
 * a title/episode has been reconciled it's remembered so it isn't re-checked
 * (and re-written) on every poll.
 *
 * Matching is by provider id (TMDB, then IMDB, then TVDB). A title match is
 * the fallback only for items that carry no ids at all: an item whose ids
 * simply miss on the other server is absent there, and a same-named
 * different show ("Battlestar Galactica" 1978 vs 2003) must not be marked
 * in its place.
 *
 * Anything that cannot be reconciled (show only on one server, an episode
 * the other server lacks) is remembered for a day and not retried or logged
 * again until then. Without that, a few hundred Plex-only shows produced a
 * few hundred error lines every five minutes and flooded the Logs tab.
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
const RETRY_AFTER_MS = 24 * 60 * 60 * 1000;

let synced: Set<string> | null = null;

// In memory only: a restart is a fine moment to try everything once more.
const retryAfter = new Map<string, number>();

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

function hasIds(i: LibItem): boolean {
  return Boolean(i.tmdbId || i.imdbId || i.tvdbId);
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

/** Exactly one title match, or nothing: two same-named entries are ambiguous. */
function uniqueTitleMatch(items: LibItem[], title: string): LibItem | undefined {
  const hits = items.filter((t) => titlesMatch(t.title, title));
  return hits.length === 1 ? hits[0] : undefined;
}

/** The other server's copy of this item: provider ids when the source has any, a unique title match only when it has none. */
function findMatch(source: LibItem, target: LibIndex): LibItem | undefined {
  if (source.tmdbId && target.byTmdb.has(source.tmdbId)) return target.byTmdb.get(source.tmdbId);
  if (source.imdbId && target.byImdb.has(source.imdbId)) return target.byImdb.get(source.imdbId);
  if (source.tvdbId && target.byTvdb.has(source.tvdbId)) return target.byTvdb.get(source.tvdbId);
  if (hasIds(source)) return undefined;
  return uniqueTitleMatch(target.all, source.title);
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

function shouldSkip(key: string): boolean {
  const until = retryAfter.get(key);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  retryAfter.delete(key);
  return false;
}

/** Logs the first failure for a key and silences it for a day. */
function noteFailure(key: string, message: string): void {
  if (!retryAfter.has(key)) console.error(`${message} (will retry in 24h)`);
  retryAfter.set(key, Date.now() + RETRY_AFTER_MS);
}

interface HistoryEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
  /** The show's key on its own server (Plex grandparentRatingKey, Jellyfin SeriesId) when the history row carries one. */
  showKey?: string;
}

type MarkEpisodes = (
  showServerKey: string,
  eps: { seasonNumber: number; episodeNumber: number; viewedAt?: string }[],
  showTitle: string
) => Promise<void>;

export async function syncWatchedBetweenServers(): Promise<number> {
  const seen = await loadSynced();
  let changed = false;
  let sinceFlush = 0;
  let marks = 0;

  // A large first-time backlog can take a while even with concurrency - flush
  // progress periodically instead of only at the very end, so a killed or
  // crashed run doesn't lose everything it already reconciled.
  async function markDirty(count = 1) {
    changed = true;
    sinceFlush += count;
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
  const plexEps: HistoryEpisode[] = plexEpsR.status === 'fulfilled' ? plexEpsR.value : [];
  const jellyfinEps: HistoryEpisode[] = jellyfinEpsR.status === 'fulfilled' ? jellyfinEpsR.value : [];

  // A failed library listing must not look like an empty library - reconciling
  // against "nothing" would log a spurious not-found error for every watched
  // item on the other side.
  const plexMoviesOk = plexMoviesR.status === 'fulfilled';
  const jellyfinMoviesOk = jellyfinMoviesR.status === 'fulfilled';
  const plexShowsOk = plexShowsR.status === 'fulfilled';
  const jellyfinShowsOk = jellyfinShowsR.status === 'fulfilled';
  // A skipped direction is not the same as nothing to do: say which listing
  // failed, or a broken server looks like a perfectly synced one.
  const listings: [string, PromiseSettledResult<unknown>][] = [
    ['Plex movies', plexMoviesR], ['Jellyfin movies', jellyfinMoviesR], ['Plex shows', plexShowsR],
    ['Jellyfin shows', jellyfinShowsR], ['Plex watched episodes', plexEpsR], ['Jellyfin watched episodes', jellyfinEpsR],
  ];
  for (const [name, r] of listings) {
    if (r.status === 'rejected') console.error(`[watchedSync] ${name} listing failed, that direction is skipped this run:`, r.reason instanceof Error ? r.reason.message : r.reason);
  }

  const plexMovieIdx = buildIndex(plexMovies);
  const jellyfinMovieIdx = buildIndex(jellyfinMovies);
  const plexShowIdx = buildIndex(plexShows);
  const jellyfinShowIdx = buildIndex(jellyfinShows);

  // Own-server show lookups for history rows: by the server's own key when
  // the row carries one (never ambiguous), by title only as a fallback.
  const plexShowsByKey = new Map(plexShows.map((s) => [s.serverKey, s]));
  const jellyfinShowsByKey = new Map(jellyfinShows.map((s) => [s.serverKey, s]));
  const plexShowsByTitle = new Map(plexShows.map((s) => [norm(s.title), s]));
  const jellyfinShowsByTitle = new Map(jellyfinShows.map((s) => [norm(s.title), s]));

  async function reconcileMovie(
    movie: LibItem,
    targetIdx: LibIndex,
    markTarget: (serverKey: string) => Promise<void>,
    direction: string
  ) {
    const key = `movie:${canonical(movie)}`;
    if (seen.has(key) || shouldSkip(key)) return;
    const match = findMatch(movie, targetIdx);
    if (!match) {
      noteFailure(key, `[watchedSync] cannot sync "${movie.title}" ${direction}: not in the other library`);
      return;
    }
    // Same dual-identity rule as episodes: remember the item under the
    // other server's id as well, so the reverse direction never re-marks it.
    const targetKey = `movie:${canonical(match)}`;
    if (match.watched || seen.has(targetKey)) {
      seen.add(key);
      seen.add(targetKey);
      await markDirty();
      return;
    }
    try {
      await markTarget(match.serverKey);
      seen.add(key);
      seen.add(targetKey);
      await markDirty();
      marks += 1;
      console.log(`[watchedSync] marked "${movie.title}" watched ${direction}`);
    } catch (err) {
      noteFailure(key, `[watchedSync] failed to sync "${movie.title}" ${direction}: ${err instanceof Error ? err.message : err}`);
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

  function ownShowFor(ep: HistoryEpisode, byKey: Map<string, LibItem>, byTitle: Map<string, LibItem>): LibItem | undefined {
    return (ep.showKey && byKey.get(ep.showKey)) || byTitle.get(norm(ep.showTitle));
  }

  const jellyfinEpSet = new Set(
    jellyfinEps.map((e) => epKey(ownShowFor(e, jellyfinShowsByKey, jellyfinShowsByTitle), e.showTitle, e.seasonNumber, e.episodeNumber))
  );
  const plexEpSet = new Set(
    plexEps.map((e) => epKey(ownShowFor(e, plexShowsByKey, plexShowsByTitle), e.showTitle, e.seasonNumber, e.episodeNumber))
  );

  interface Batch {
    targetKey: string;
    showTitle: string;
    eps: { key: string; targetEpKey: string; seasonNumber: number; episodeNumber: number; viewedAt: string }[];
  }

  /**
   * One pass to decide what each history row needs, then one mark call per
   * target show with every episode it needs. The old shape made a full
   * episode-list fetch on the target server per episode, so a first-run
   * backlog of two thousand episodes cost two thousand series fetches.
   */
  async function reconcileEpisodes(
    eps: HistoryEpisode[],
    ownByKey: Map<string, LibItem>,
    ownByTitle: Map<string, LibItem>,
    targetEpSet: Set<string>,
    targetShowIdx: LibIndex,
    markTargetEpisodes: MarkEpisodes,
    direction: string
  ) {
    const batches = new Map<string, Batch>();
    for (const ep of eps) {
      const ownShow = ownShowFor(ep, ownByKey, ownByTitle);
      const key = epKey(ownShow, ep.showTitle, ep.seasonNumber, ep.episodeNumber);
      if (seen.has(key) || shouldSkip(key)) continue;
      const targetShow = ownShow ? findMatch(ownShow, targetShowIdx) : uniqueTitleMatch(targetShowIdx.all, ep.showTitle);
      // The same show can carry different provider ids on the two servers
      // (Kitchen Nightmares: Plex says TMDB 235884, Jellyfin says 11294), so
      // an episode has one key per side. Both are checked and both are
      // remembered; remembering only the source-side key let the reverse
      // direction re-mark the episode on the next run, which on Plex resets
      // its watched date to "now".
      const targetKey = targetShow ? epKey(targetShow, ep.showTitle, ep.seasonNumber, ep.episodeNumber) : null;
      if (targetEpSet.has(key) || (targetKey !== null && targetEpSet.has(targetKey))) {
        seen.add(key);
        if (targetKey) seen.add(targetKey);
        await markDirty();
        continue;
      }
      if (!targetShow) {
        noteFailure(key, `[watchedSync] cannot sync "${ep.showTitle}" S${ep.seasonNumber}E${ep.episodeNumber} ${direction}: show not in the other library`);
        continue;
      }
      const batch = batches.get(targetShow.serverKey) ?? { targetKey: targetShow.serverKey, showTitle: ep.showTitle, eps: [] };
      batch.eps.push({ key, targetEpKey: targetKey as string, seasonNumber: ep.seasonNumber, episodeNumber: ep.episodeNumber, viewedAt: ep.viewedAt });
      batches.set(targetShow.serverKey, batch);
    }

    await mapWithConcurrency(Array.from(batches.values()), async (batch) => {
      try {
        await markTargetEpisodes(batch.targetKey, batch.eps, batch.showTitle);
        for (const e of batch.eps) {
          seen.add(e.key);
          seen.add(e.targetEpKey);
        }
        await markDirty(batch.eps.length);
        marks += batch.eps.length;
        const list = batch.eps.map((e) => `S${e.seasonNumber}E${e.episodeNumber}`).join(', ');
        console.log(`[watchedSync] marked "${batch.showTitle}" ${list} watched ${direction}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        for (const e of batch.eps) {
          noteFailure(e.key, `[watchedSync] failed to sync "${batch.showTitle}" S${e.seasonNumber}E${e.episodeNumber} ${direction}: ${msg}`);
        }
      }
    });
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
      ? reconcileEpisodes(plexEps, plexShowsByKey, plexShowsByTitle, jellyfinEpSet, jellyfinShowIdx, markJellyfinSeriesEpisodesWatchedById, '(Plex → Jellyfin)')
      : Promise.resolve(),
    plexShowsOk
      ? reconcileEpisodes(jellyfinEps, jellyfinShowsByKey, jellyfinShowsByTitle, plexEpSet, plexShowIdx, markPlexShowEpisodesWatchedByKey, '(Jellyfin → Plex)')
      : Promise.resolve(),
  ]);

  if (changed) await persistSynced();
  return marks;
}
