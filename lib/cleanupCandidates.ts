import path from 'path';
import { readJsonState, writeJsonAtomic } from './jsonState';
import { getEpisodeWatchHistory, getInProgressEpisodes, getPlayedSessionKeys } from './mediaServer';
import { getSonarrSeriesList, getSonarrEpisodeFileInfoMap, type SonarrEpisodeFileInfo } from './sonarr';
import { titlesMatch, findUniqueByTitle } from './titleMatch';
import { getRawEnvValue } from './settings';

export interface CleanupCandidate {
  showTitle: string;
  tmdbId: number | null;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
  seriesId: number;
  episodeId: number;
  episodeFileId: number;
  reason: string;
  /** When the app first saw this episode played past the cleanup threshold - the auto-delete grace clock for threshold watches. Null when there's no such evidence. */
  thresholdFirstSeen: string | null;
  posterPath: string | null;
}

// Persistent memory of "this episode was genuinely played past the cleanup
// threshold", keyed like playedKeys ("title:season:episode"). Two jobs:
// (1) once a server flips such an episode to watched, its in-progress state
// vanishes - without this memory the row would look identical to a manual
// mark and get mislabeled; (2) an in-progress row's viewedAt is recomputed
// as "now" on every request, so the auto-delete grace period counts from
// this first-seen stamp instead.
const THRESHOLD_STATE_FILE = path.join(process.cwd(), 'data', 'threshold-watch-state.json');
const THRESHOLD_STATE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

// One in-memory copy shared by every caller (the Watch and Status pages, the
// chopping-block preview and the hourly job can all run at once). Each used
// to read, add its own keys and write the whole file back, so the second
// writer dropped the first one's entries and reset those grace clocks.
let thresholdSeenCache: Record<string, string> | null = null;

async function loadThresholdSeen(): Promise<Record<string, string>> {
  if (thresholdSeenCache) return thresholdSeenCache;
  const parsed = await readJsonState<unknown>(THRESHOLD_STATE_FILE, {});
  thresholdSeenCache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  return thresholdSeenCache;
}

async function saveThresholdSeen(state: Record<string, string>): Promise<void> {
  // Prune stale entries so the file can't grow forever.
  const floor = Date.now() - THRESHOLD_STATE_MAX_AGE_MS;
  for (const [k, v] of Object.entries(state)) {
    if (new Date(v).getTime() < floor) delete state[k];
  }
  await writeJsonAtomic(THRESHOLD_STATE_FILE, state);
}

/** Shared with the movie side of "recently watched" so both use the same threshold. */
export function getWatchedPercentThreshold(): number {
  const raw = Number(process.env.CLEANUP_WATCHED_PERCENT);
  return (Number.isFinite(raw) && raw > 0 ? raw : 90) / 100;
}

/**
 * Read live from the settings file on every call, never from boot-time env:
 * the auto-delete toggle and grace period are read live too, so a save that
 * adds a show here and turns auto-delete on in the same breath must protect
 * the show from the very next run, not from the next restart.
 */
export async function getExcludedShows(): Promise<Set<string>> {
  const raw = (await getRawEnvValue('CLEANUP_EXCLUDED_SHOWS')) ?? process.env.CLEANUP_EXCLUDED_SHOWS ?? '';
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

/**
 * Whether a show title is on the excluded list. Tolerant on purpose: Sonarr
 * can rename "Roseanne" to "Roseanne (1988)" on a metadata refresh, and an
 * exact string comparison would silently unprotect it. Over-protecting is
 * the safe direction for a list of irreplaceable files.
 */
export function isExcludedTitle(excluded: Set<string>, title: string): boolean {
  const t = title.trim().toLowerCase();
  if (excluded.has(t)) return true;
  for (const x of Array.from(excluded)) if (titlesMatch(x, title)) return true;
  return false;
}

/** Two dates on different sides of a timezone can differ by one calendar day and still be the same episode. */
function sameAirDate(a: string, b: string): boolean {
  const diff = Math.abs(new Date(`${a}T00:00:00Z`).getTime() - new Date(`${b}T00:00:00Z`).getTime());
  return diff <= 24 * 60 * 60 * 1000;
}

/**
 * Tolerant lookup into "title:season:episode"-keyed signal sets: the
 * season/episode suffix must match exactly, the title part via titlesMatch.
 * Exact key equality silently broke the labeling - the in-progress, session
 * log, and watch-history sources format the same show's title differently
 * ("Big Brother (US)" vs "Big Brother"), so a real threshold watch fell
 * through to "Marked watched manually".
 */
function findSignalKey(keys: Set<string> | string[], showTitle: string, seasonNumber: number, episodeNumber: number): string | null {
  const suffix = `:${seasonNumber}:${episodeNumber}`;
  for (const k of Array.from(keys)) {
    if (!k.endsWith(suffix)) continue;
    if (titlesMatch(k.slice(0, -suffix.length), showTitle)) return k;
  }
  return null;
}

interface WatchSignal {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
  reason: string;
  thresholdFirstSeen: string | null;
  /** The media server's air date for this episode, when it has one. */
  airDate: string | null;
}

export async function getCleanupCandidates(limit = 30): Promise<CleanupCandidate[]> {
  const excluded = await getExcludedShows();
  const threshold = getWatchedPercentThreshold();
  // Fetch history MUCH deeper than the display limit: the filter below
  // discards rewatches and rows whose files are already gone, and a window
  // sized to the limit meant only whatever survived the last 30 raw rows
  // ever showed - watched shows flickered in and out between visits as new
  // watch events shuffled the window. One Plex call either way.
  const historyDepth = Math.max(limit * 10, 500);
  const [history, inProgress, series, playedKeys] = await Promise.all([
    getEpisodeWatchHistory(historyDepth),
    getInProgressEpisodes(),
    getSonarrSeriesList(),
    getPlayedSessionKeys(historyDepth),
  ]);

  // Two independent signals, either one qualifies: Plex's own watch state
  // (viewCount/lastViewedAt - set by either real playback OR a manual
  // "mark watched", cross-referenced against the session-history log to
  // tell which one it was), or an in-progress episode already at/above
  // CLEANUP_WATCHED_PERCENT per Plex's raw viewOffset/duration.
  const thresholdSeen = await loadThresholdSeen();

  // Remember every episode currently sitting past the threshold BEFORE
  // labeling anything - once the server flips it to watched, this memory is
  // the only proof it was actually played and not just marked.
  const nowIso = new Date().toISOString();
  let thresholdStateChanged = false;
  const overThreshold = inProgress.filter((e) => e.duration > 0 && e.viewOffset / e.duration >= threshold);
  for (const e of overThreshold) {
    if (!findSignalKey(Object.keys(thresholdSeen), e.showTitle, e.seasonNumber, e.episodeNumber)) {
      thresholdSeen[`${e.showTitle.toLowerCase().trim()}:${e.seasonNumber}:${e.episodeNumber}`] = nowIso;
      thresholdStateChanged = true;
    }
  }
  if (thresholdStateChanged) await saveThresholdSeen(thresholdSeen).catch(() => {});

  const thresholdSeenKeys = Object.keys(thresholdSeen);
  const watchedSignals: WatchSignal[] = history.map((w) => {
    // Three-way split: a logged play session is a real watch; no session but
    // the app saw it played past the cleanup threshold means the watched
    // flag came from that playback; neither means someone marked it watched
    // by hand in Plex/Jellyfin (or in this app).
    const played = findSignalKey(playedKeys, w.showTitle, w.seasonNumber, w.episodeNumber) !== null;
    const seenKey = findSignalKey(thresholdSeenKeys, w.showTitle, w.seasonNumber, w.episodeNumber);
    const firstSeen = seenKey ? thresholdSeen[seenKey] : null;
    return {
      showTitle: w.showTitle,
      seasonNumber: w.seasonNumber,
      episodeNumber: w.episodeNumber,
      viewedAt: w.viewedAt,
      reason: played ? 'Watched' : firstSeen ? 'Watched to cleanup threshold' : 'Marked watched manually',
      thresholdFirstSeen: firstSeen,
      airDate: w.airDate ?? null,
    };
  });
  const almostDoneSignals: WatchSignal[] = overThreshold.map((e) => {
    const seenKey = findSignalKey(Object.keys(thresholdSeen), e.showTitle, e.seasonNumber, e.episodeNumber);
    return {
      showTitle: e.showTitle,
      seasonNumber: e.seasonNumber,
      episodeNumber: e.episodeNumber,
      viewedAt: new Date().toISOString(),
      reason: `${Math.round((e.viewOffset / e.duration) * 100)}% watched`,
      thresholdFirstSeen: (seenKey ? thresholdSeen[seenKey] : null) ?? nowIso,
      airDate: null,
    };
  });

  // Resolve every signal to a series first (deduped), THEN fetch each
  // distinct series' episode list exactly once, in parallel. The old shape
  // fetched the full episode list per episode, sequentially - and its
  // per-episode cache could never hit, because the dedupe directly above it
  // already skipped every repeated key.
  const seen = new Set<string>();
  const resolved: { watched: WatchSignal; seriesId: number; tmdbId: number | null; posterPath: string | null }[] = [];

  for (const watched of [...watchedSignals, ...almostDoneSignals]) {
    if (isExcludedTitle(excluded, watched.showTitle)) continue;

    // Strict equality-after-normalization, and exactly one hit. Two Sonarr
    // entries matching the same signal (a show and its remake) is ambiguous,
    // and an ambiguous match must never reach a delete: skip it.
    const matchedSeries = findUniqueByTitle(series, watched.showTitle, (s) => s.title);
    if (!matchedSeries) continue;

    // Dedupe by the resolved Sonarr series, not the raw signal title - the
    // watched-history and in-progress signals can format the same show's
    // title differently (e.g. one carries a "(2020)" disambiguator, the
    // other doesn't), so a title-keyed dedup before matching lets both
    // survive as "different" episodes and produces a visible duplicate row.
    const dedupeKey = `${matchedSeries.id}:${watched.seasonNumber}:${watched.episodeNumber}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    resolved.push({ watched, seriesId: matchedSeries.id, tmdbId: matchedSeries.tmdbId ?? null, posterPath: matchedSeries.posterPath });
  }

  const fileMaps = new Map<number, Map<string, SonarrEpisodeFileInfo>>();
  await Promise.all(
    Array.from(new Set(resolved.map((r) => r.seriesId))).map(async (id) => {
      fileMaps.set(id, await getSonarrEpisodeFileInfoMap(id).catch(() => new Map()));
    })
  );

  const candidates: CleanupCandidate[] = [];
  for (const { watched, seriesId, tmdbId, posterPath } of resolved) {
    const episodeFile = fileMaps.get(seriesId)?.get(`${watched.seasonNumber}:${watched.episodeNumber}`);
    if (!episodeFile) continue; // no file on disk - already cleaned up, or never had one

    // Same numbers, different episode: Plex and Jellyfin can number seasons
    // differently from TVDB (Kitchen Nightmares: Sonarr's S6 is Plex's S7).
    // When both sides know the air date and they disagree, this file is not
    // the episode that was watched. A server with no air date (an unmatched
    // local season) cannot be checked and is let through as before.
    if (watched.airDate && episodeFile.airDate && !sameAirDate(watched.airDate, episodeFile.airDate)) continue;

    // Watched before this file existed: the mark belongs to an earlier copy
    // (both servers keep watched state across a delete and re-download), so
    // a fresh rewatch download would otherwise be deletable on arrival.
    if (episodeFile.fileDateAdded && watched.reason !== 'Watched to cleanup threshold' && !watched.reason.endsWith('% watched')) {
      if (new Date(watched.viewedAt).getTime() < new Date(episodeFile.fileDateAdded).getTime()) continue;
    }

    candidates.push({
      showTitle: watched.showTitle,
      tmdbId,
      seasonNumber: watched.seasonNumber,
      episodeNumber: watched.episodeNumber,
      viewedAt: watched.viewedAt,
      seriesId,
      episodeId: episodeFile.episodeId,
      episodeFileId: episodeFile.episodeFileId,
      reason: watched.reason,
      thresholdFirstSeen: watched.thresholdFirstSeen,
      posterPath,
    });
  }

  return candidates;
}
