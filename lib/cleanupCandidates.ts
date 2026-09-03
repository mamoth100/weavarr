import { getEpisodeWatchHistory, getInProgressEpisodes, getPlayedSessionKeys } from './mediaServer';
import { getSonarrSeriesList, getSonarrEpisodeFileInfoMap } from './sonarr';
import { titlesMatch } from './titleMatch';

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
  posterPath: string | null;
}

/** Shared with the movie side of "recently watched" so both use the same threshold. */
export function getWatchedPercentThreshold(): number {
  const raw = Number(process.env.CLEANUP_WATCHED_PERCENT);
  return (Number.isFinite(raw) && raw > 0 ? raw : 90) / 100;
}

export function getExcludedShows(): Set<string> {
  const raw = process.env.CLEANUP_EXCLUDED_SHOWS ?? '';
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

interface WatchSignal {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
  reason: string;
}

export async function getCleanupCandidates(limit = 30): Promise<CleanupCandidate[]> {
  const excluded = getExcludedShows();
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
  const watchedSignals: WatchSignal[] = history.map((w) => {
    const key = `${w.showTitle.toLowerCase().trim()}:${w.seasonNumber}:${w.episodeNumber}`;
    return {
      showTitle: w.showTitle,
      seasonNumber: w.seasonNumber,
      episodeNumber: w.episodeNumber,
      viewedAt: w.viewedAt,
      reason: playedKeys.has(key) ? 'Watched' : 'Marked watched manually',
    };
  });
  const almostDoneSignals: WatchSignal[] = inProgress
    .filter((e) => e.duration > 0 && e.viewOffset / e.duration >= threshold)
    .map((e) => ({
      showTitle: e.showTitle,
      seasonNumber: e.seasonNumber,
      episodeNumber: e.episodeNumber,
      viewedAt: new Date().toISOString(),
      reason: `${Math.round((e.viewOffset / e.duration) * 100)}% watched`,
    }));

  // Resolve every signal to a series first (deduped), THEN fetch each
  // distinct series' episode list exactly once, in parallel. The old shape
  // fetched the full episode list per episode, sequentially - and its
  // per-episode cache could never hit, because the dedupe directly above it
  // already skipped every repeated key.
  const seen = new Set<string>();
  const resolved: { watched: WatchSignal; seriesId: number; tmdbId: number | null; posterPath: string | null }[] = [];

  for (const watched of [...watchedSignals, ...almostDoneSignals]) {
    if (excluded.has(watched.showTitle.trim().toLowerCase())) continue;

    // Strict equality-after-normalization - the old bidirectional substring
    // match here could resolve "Doctor Who" to "Doctor Who Confidential" and
    // hand the wrong seriesId to the episode-file delete downstream.
    const matchedSeries = series.find((s) => titlesMatch(s.title, watched.showTitle));
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

  const fileMaps = new Map<number, Map<string, { episodeId: number; episodeFileId: number }>>();
  await Promise.all(
    Array.from(new Set(resolved.map((r) => r.seriesId))).map(async (id) => {
      fileMaps.set(id, await getSonarrEpisodeFileInfoMap(id).catch(() => new Map()));
    })
  );

  const candidates: CleanupCandidate[] = [];
  for (const { watched, seriesId, tmdbId, posterPath } of resolved) {
    const episodeFile = fileMaps.get(seriesId)?.get(`${watched.seasonNumber}:${watched.episodeNumber}`);
    if (!episodeFile) continue; // no file on disk - already cleaned up, or never had one

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
      posterPath,
    });
  }

  return candidates;
}
