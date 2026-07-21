import { getPlexEpisodeWatchHistory } from './plex';
import { getSonarrSeriesList, findSonarrEpisodeFile } from './sonarr';

export interface CleanupCandidate {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
  seriesId: number;
  episodeId: number;
  episodeFileId: number;
}

function getExcludedShows(): Set<string> {
  const raw = process.env.CLEANUP_EXCLUDED_SHOWS ?? '';
  return new Set(raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export async function getCleanupCandidates(limit = 30): Promise<CleanupCandidate[]> {
  const excluded = getExcludedShows();
  const [history, series] = await Promise.all([
    getPlexEpisodeWatchHistory(limit),
    getSonarrSeriesList(),
  ]);

  const candidates: CleanupCandidate[] = [];
  const episodeCache = new Map<string, ReturnType<typeof findSonarrEpisodeFile>>();
  const seen = new Set<string>();

  for (const watched of history) {
    if (excluded.has(watched.showTitle.trim().toLowerCase())) continue;

    // History is newest-first, so the first time we see a season/episode is its most recent watch — skip repeats.
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
    if (!episodeFile) continue; // no file on disk — already cleaned up, or never had one

    candidates.push({
      showTitle: watched.showTitle,
      seasonNumber: watched.seasonNumber,
      episodeNumber: watched.episodeNumber,
      viewedAt: watched.viewedAt,
      seriesId: matchedSeries.id,
      episodeId: episodeFile.episodeId,
      episodeFileId: episodeFile.episodeFileId,
    });
  }

  return candidates;
}
