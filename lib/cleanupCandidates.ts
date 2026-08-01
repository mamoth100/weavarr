import { getEpisodeWatchHistory, getInProgressEpisodes, getPlayedSessionKeys } from './mediaServer';
import { getSonarrSeriesList, findSonarrEpisodeFile } from './sonarr';

export interface CleanupCandidate {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
  seriesId: number;
  episodeId: number;
  episodeFileId: number;
  reason: string;
}

/** Shared with the movie side of "recently watched" so both use the same threshold. */
export function getWatchedPercentThreshold(): number {
  const raw = Number(process.env.CLEANUP_WATCHED_PERCENT);
  return (Number.isFinite(raw) && raw > 0 ? raw : 90) / 100;
}

function getExcludedShows(): Set<string> {
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
  const [history, inProgress, series, playedKeys] = await Promise.all([
    getEpisodeWatchHistory(limit),
    getInProgressEpisodes(),
    getSonarrSeriesList(),
    getPlayedSessionKeys(limit),
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

  const candidates: CleanupCandidate[] = [];
  const episodeCache = new Map<string, ReturnType<typeof findSonarrEpisodeFile>>();
  const seen = new Set<string>();

  for (const watched of [...watchedSignals, ...almostDoneSignals]) {
    if (excluded.has(watched.showTitle.trim().toLowerCase())) continue;

    const dedupeKey = `${watched.showTitle.toLowerCase()}:${watched.seasonNumber}:${watched.episodeNumber}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const matchedSeries = series.find((s) => {
      const a = s.title.toLowerCase().trim();
      const b = watched.showTitle.toLowerCase().trim();
      return a === b || a.includes(b) || b.includes(a);
    });
    if (!matchedSeries) continue;

    const cacheKey = `${matchedSeries.id}:${watched.seasonNumber}:${watched.episodeNumber}`;
    if (!episodeCache.has(cacheKey)) {
      episodeCache.set(cacheKey, findSonarrEpisodeFile(matchedSeries.id, watched.seasonNumber, watched.episodeNumber));
    }
    const episodeFile = await episodeCache.get(cacheKey);
    if (!episodeFile) continue; // no file on disk - already cleaned up, or never had one

    candidates.push({
      showTitle: watched.showTitle,
      seasonNumber: watched.seasonNumber,
      episodeNumber: watched.episodeNumber,
      viewedAt: watched.viewedAt,
      seriesId: matchedSeries.id,
      episodeId: episodeFile.episodeId,
      episodeFileId: episodeFile.episodeFileId,
      reason: watched.reason,
    });
  }

  return candidates;
}
