import { getAllSonarrSeries, getSonarrEpisodeFileSet } from './sonarr';
import { getEpisodeWatchHistory } from './mediaServer';
import { titlesMatch } from './titleMatch';
import { listRows } from './watchlistDb';

/**
 * Stalled-show resurfacing: shows you watched most of and then quietly
 * dropped. Nobody's app does this because nobody else holds both halves of
 * the data - the arr side knows what's on disk, the media server knows what
 * you actually watched and when. A show qualifies when you've seen at least
 * WATCHED_FRACTION of its on-disk episodes, something unwatched remains,
 * and the last view is older than the configured threshold.
 */

const WATCHED_FRACTION = 0.6;

export interface StalledShow {
  seriesId: number;
  title: string;
  tmdbId: number | null;
  hasPoster: boolean;
  watchedOnDisk: number;
  totalOnDisk: number;
  daysSince: number;
  nextUp: { seasonNumber: number; episodeNumber: number } | null;
}

/** Days without a view before a mostly-watched show counts as stalled. STALLED_SHOW_DAYS in App Behavior; 0 turns the feature off, unset means 90. */
export function stalledDaysThreshold(): number {
  const raw = process.env.STALLED_SHOW_DAYS;
  if (raw === undefined || raw.trim() === '') return 90;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return 90;
  return parsed;
}

export async function getStalledShows(): Promise<StalledShow[]> {
  const thresholdDays = stalledDaysThreshold();
  if (thresholdDays === 0) return [];

  const [series, history] = await Promise.all([getAllSonarrSeries(), getEpisodeWatchHistory(1000)]);
  const withFiles = series.filter((s) => s.episodeFileCount > 0);
  const fileSets = await Promise.all(withFiles.map((s) => getSonarrEpisodeFileSet(s.id).catch(() => new Set<string>())));

  // A show deliberately closed out (marked watched) or written off (not
  // interested) is not stalled - resurfacing those would just nag.
  const dismissedTmdbIds = new Set(
    [...listRows('watched'), ...listRows('sucks')]
      .filter((r) => r.media_type === 'tv')
      .map((r) => r.tmdb_id as number)
  );

  const now = Date.now();
  const out: StalledShow[] = [];
  withFiles.forEach((s, i) => {
    if (s.tmdbId !== null && dismissedTmdbIds.has(s.tmdbId)) return;
    const files = fileSets[i];
    if (files.size === 0) return;
    const showHistory = history.filter((w) => titlesMatch(w.showTitle, s.title));
    if (showHistory.length === 0) return;

    const watchedKeys = new Set(showHistory.map((w) => `${w.seasonNumber}:${w.episodeNumber}`));
    const onDisk = Array.from(files);
    const watchedOnDisk = onDisk.filter((k) => watchedKeys.has(k)).length;
    if (watchedOnDisk / onDisk.length < WATCHED_FRACTION) return;

    const unwatched = onDisk
      .filter((k) => !watchedKeys.has(k))
      .map((k) => {
        const [seasonNumber, episodeNumber] = k.split(':').map(Number);
        return { seasonNumber, episodeNumber };
      })
      .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
    if (unwatched.length === 0) return;

    const lastWatchedMs = Math.max(...showHistory.map((w) => new Date(w.viewedAt).getTime()));
    if (!Number.isFinite(lastWatchedMs)) return;
    const daysSince = Math.floor((now - lastWatchedMs) / 86_400_000);
    if (daysSince < thresholdDays) return;

    out.push({
      seriesId: s.id,
      title: s.title,
      tmdbId: s.tmdbId,
      hasPoster: Boolean(s.posterPath),
      watchedOnDisk,
      totalOnDisk: onDisk.length,
      daysSince,
      nextUp: unwatched[0] ?? null,
    });
  });

  // Longest-abandoned first - the deepest-buried stories surface on top.
  return out.sort((a, b) => b.daysSince - a.daysSince);
}
