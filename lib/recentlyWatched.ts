import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { getCleanupCandidates, getWatchedPercentThreshold } from './cleanupCandidates';
import { getAllRadarrMovies } from './radarr';
import { getPlexWatchedMovies, getPlexInProgressMovies } from './plex';
import { titleFuzzyMatch } from './readyToWatch';

export interface RecentlyWatchedMovie {
  type: 'movie';
  key: string;
  id: number;
  title: string;
  year: number;
  watchedAt: string;
  reason: string;
  sizeOnDisk: number;
}

export interface RecentlyWatchedEpisode {
  type: 'tv';
  key: string;
  seriesId: number;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: string;
  reason: string;
}

export type RecentlyWatchedItem = RecentlyWatchedMovie | RecentlyWatchedEpisode;

const STATE_FILE = path.join(process.cwd(), 'data', 'dismissed-watched.json');

// Keyed by stable item identity (movieId, or seriesId+season+episode) — NOT by
// watchedAt, since an in-progress item's watchedAt is recomputed fresh on
// every request and would never match a previously-saved dismissal.
let dismissed: Set<string> | null = null;

async function loadDismissed(): Promise<Set<string>> {
  if (dismissed) return dismissed;
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    dismissed = new Set(JSON.parse(raw));
  } catch {
    dismissed = new Set();
  }
  return dismissed;
}

export async function dismissRecentlyWatched(key: string): Promise<void> {
  const seen = await loadDismissed();
  seen.add(key);
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(Array.from(seen)), 'utf8');
}

/** Movie-side equivalent of getCleanupCandidates — same "watched or ≥threshold% in" signal, matched to Radarr for delete. */
async function getRecentlyWatchedMovies(limit: number): Promise<RecentlyWatchedMovie[]> {
  const threshold = getWatchedPercentThreshold();
  const [movies, watched, inProgress] = await Promise.all([
    getAllRadarrMovies(),
    getPlexWatchedMovies(),
    getPlexInProgressMovies(),
  ]);

  const signals: { title: string; watchedAt: string; reason: string }[] = [
    ...watched.map((w) => ({ title: w.title, watchedAt: w.lastViewedAt, reason: 'Watched' })),
    ...inProgress
      .filter((p) => p.duration > 0 && p.viewOffset / p.duration >= threshold)
      .map((p) => ({
        title: p.title,
        watchedAt: new Date().toISOString(),
        reason: `${Math.round((p.viewOffset / p.duration) * 100)}% watched`,
      })),
  ];

  const seenTitles = new Set<string>();
  const results: RecentlyWatchedMovie[] = [];
  for (const s of signals) {
    const titleKey = s.title.toLowerCase().trim();
    if (seenTitles.has(titleKey)) continue;
    seenTitles.add(titleKey);

    const matched = movies.find((m) => m.hasFile && titleFuzzyMatch(m.title, s.title));
    if (!matched) continue; // no file — already gone, or never had one

    results.push({
      type: 'movie',
      key: `movie-${matched.id}`,
      id: matched.id,
      title: matched.title,
      year: matched.year,
      watchedAt: s.watchedAt,
      reason: s.reason,
      sizeOnDisk: matched.sizeOnDisk,
    });
  }
  return results;
}

export async function getRecentlyWatched(limit = 30): Promise<RecentlyWatchedItem[]> {
  const [episodes, movies, seenDismissed] = await Promise.all([
    getCleanupCandidates(limit),
    getRecentlyWatchedMovies(limit),
    loadDismissed(),
  ]);

  const episodeItems: RecentlyWatchedEpisode[] = episodes.map((e) => ({
    type: 'tv',
    key: `tv-${e.seriesId}-${e.seasonNumber}-${e.episodeNumber}`,
    seriesId: e.seriesId,
    title: e.showTitle,
    seasonNumber: e.seasonNumber,
    episodeNumber: e.episodeNumber,
    watchedAt: e.viewedAt,
    reason: e.reason,
  }));

  return [...episodeItems, ...movies]
    .filter((item) => !seenDismissed.has(item.key))
    .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))
    .slice(0, limit);
}
