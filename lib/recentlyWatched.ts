import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { getCleanupCandidates, getWatchedPercentThreshold } from './cleanupCandidates';
import { getAllRadarrMovies } from './radarr';
import { getWatchedMovies, getInProgressMovies } from './mediaServer';
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
  posterPath: string | null;
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
  posterPath: string | null;
}

export type RecentlyWatchedItem = RecentlyWatchedMovie | RecentlyWatchedEpisode;

const STATE_FILE = path.join(process.cwd(), 'data', 'dismissed-watched.json');

// Keyed by stable item identity (movieId, or seriesId+season+episode) - NOT by
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

/** Movie-side equivalent of getCleanupCandidates - same "watched or ≥threshold% in" signal, matched to Radarr for delete. */
async function getRecentlyWatchedMovies(limit: number): Promise<RecentlyWatchedMovie[]> {
  const threshold = getWatchedPercentThreshold();
  const [movies, watched, inProgress] = await Promise.all([
    getAllRadarrMovies(),
    getWatchedMovies(),
    getInProgressMovies(),
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

  // Dedupe by the resolved Radarr movie, not the raw signal title - two
  // signals with slightly different title strings (e.g. Plex vs Jellyfin
  // naming) can both fuzzy-match the same movie and would otherwise both
  // survive a title-keyed dedup, producing two entries with the same key.
  const seenMovieIds = new Set<number>();
  const results: RecentlyWatchedMovie[] = [];
  for (const s of signals) {
    const matched = movies.find((m) => m.hasFile && titleFuzzyMatch(m.title, s.title));
    if (!matched) continue; // no file - already gone, or never had one
    if (seenMovieIds.has(matched.id)) continue;
    seenMovieIds.add(matched.id);

    results.push({
      type: 'movie',
      key: `movie-${matched.id}`,
      id: matched.id,
      title: matched.title,
      year: matched.year,
      watchedAt: s.watchedAt,
      reason: s.reason,
      sizeOnDisk: matched.sizeOnDisk,
      posterPath: matched.posterPath,
    });
  }
  return results;
}

export async function getRecentlyWatched(limit = 30): Promise<RecentlyWatchedItem[]> {
  // allSettled, not all: the episode branch needs Sonarr and the movie branch
  // needs Radarr - one backend restarting used to reject the whole call, so
  // the section silently vanished from both the Watch and Status pages even
  // though the other branch's data was fine. Only fail when BOTH fail.
  const [episodesR, moviesR, seenDismissed] = await Promise.all([
    getCleanupCandidates(limit).then(
      (v) => ({ ok: true as const, value: v }),
      (e) => ({ ok: false as const, error: e })
    ),
    getRecentlyWatchedMovies(limit).then(
      (v) => ({ ok: true as const, value: v }),
      (e) => ({ ok: false as const, error: e })
    ),
    loadDismissed(),
  ]);

  if (!episodesR.ok && !moviesR.ok) throw episodesR.error;
  const episodes = episodesR.ok ? episodesR.value : [];
  const movies = moviesR.ok ? moviesR.value : [];

  const episodeItems: RecentlyWatchedEpisode[] = episodes.map((e) => ({
    type: 'tv',
    key: `tv-${e.seriesId}-${e.seasonNumber}-${e.episodeNumber}`,
    seriesId: e.seriesId,
    title: e.showTitle,
    seasonNumber: e.seasonNumber,
    episodeNumber: e.episodeNumber,
    watchedAt: e.viewedAt,
    reason: e.reason,
    posterPath: e.posterPath,
  }));

  return [...episodeItems, ...movies]
    .filter((item) => !seenDismissed.has(item.key))
    .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))
    .slice(0, limit);
}
