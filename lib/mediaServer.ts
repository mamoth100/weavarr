/**
 * Merges Plex and Jellyfin into a single "media server" surface, so every
 * consumer in the app calls one set of functions regardless of which
 * backend(s) are enabled. ENABLE_PLEX defaults to on (unset !== 'false') to
 * preserve existing behavior; ENABLE_JELLYFIN defaults to off (must be
 * explicitly 'true') since it's a new opt-in backend. Both can be on at
 * once - results are merged rather than one replacing the other.
 */
import * as plex from './plex';
import * as jellyfin from './jellyfin';

export function plexEnabled(): boolean {
  return process.env.ENABLE_PLEX !== 'false' && Boolean(process.env.PLEX_URL && process.env.PLEX_TOKEN);
}

export function jellyfinEnabled(): boolean {
  return process.env.ENABLE_JELLYFIN === 'true' && Boolean(process.env.JELLYFIN_URL && process.env.JELLYFIN_API_KEY);
}

export interface WatchedMovie {
  title: string;
  lastViewedAt: string;
}

export interface WatchedEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
}

export interface PlayedEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
}

export interface InProgressMovie {
  title: string;
  viewOffset: number;
  duration: number;
}

export interface InProgressEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewOffset: number;
  duration: number;
}

/** True if a title matching the given name exists in any enabled backend's library. */
export async function hasTitle(title: string): Promise<boolean> {
  const checks: Promise<boolean>[] = [];
  if (plexEnabled()) checks.push(plex.plexHasTitle(title).catch(() => false));
  if (jellyfinEnabled()) checks.push(jellyfin.jellyfinHasTitle(title).catch(() => false));
  if (checks.length === 0) return false;
  return (await Promise.all(checks)).some(Boolean);
}

/** True if this specific episode has been scanned into any enabled backend. */
export async function hasEpisode(showTitle: string, seasonNumber: number, episodeNumber: number): Promise<boolean> {
  const checks: Promise<boolean>[] = [];
  if (plexEnabled()) checks.push(plex.plexHasEpisode(showTitle, seasonNumber, episodeNumber).catch(() => false));
  if (jellyfinEnabled()) checks.push(jellyfin.jellyfinHasEpisode(showTitle, seasonNumber, episodeNumber).catch(() => false));
  if (checks.length === 0) return false;
  return (await Promise.all(checks)).some(Boolean);
}

/** Marks a movie watched on every enabled backend. Succeeds if at least one does; throws only if all attempts fail. */
export async function markMovieWatched(title: string): Promise<void> {
  const attempts: Promise<void>[] = [];
  if (plexEnabled()) attempts.push(plex.markPlexMovieWatched(title));
  if (jellyfinEnabled()) attempts.push(jellyfin.markJellyfinMovieWatched(title));
  if (attempts.length === 0) throw new Error('No media server is enabled');
  const results = await Promise.allSettled(attempts);
  if (results.every((r) => r.status === 'rejected')) {
    throw new Error((results[0] as PromiseRejectedResult).reason?.message ?? 'Mark watched failed');
  }
}

/** Marks specific episodes watched on every enabled backend. Succeeds if at least one does. */
export async function markEpisodesWatched(
  showTitle: string,
  episodes: { seasonNumber: number; episodeNumber: number }[]
): Promise<void> {
  const attempts: Promise<void>[] = [];
  if (plexEnabled()) attempts.push(plex.markPlexEpisodesWatched(showTitle, episodes));
  if (jellyfinEnabled()) attempts.push(jellyfin.markJellyfinEpisodesWatched(showTitle, episodes));
  if (attempts.length === 0) throw new Error('No media server is enabled');
  const results = await Promise.allSettled(attempts);
  if (results.every((r) => r.status === 'rejected')) {
    throw new Error((results[0] as PromiseRejectedResult).reason?.message ?? 'Mark watched failed');
  }
}

/** Refreshes the movie library on every enabled backend. */
export async function refreshMovieLibrary(): Promise<void> {
  const jobs: Promise<void>[] = [];
  if (plexEnabled()) jobs.push(plex.refreshPlexMovieLibrary());
  if (jellyfinEnabled()) jobs.push(jellyfin.refreshJellyfinLibrary());
  await Promise.all(jobs);
}

/** Refreshes the TV library on every enabled backend. */
export async function refreshTvLibrary(): Promise<void> {
  const jobs: Promise<void>[] = [];
  if (plexEnabled()) jobs.push(plex.refreshPlexTvLibrary());
  if (jellyfinEnabled()) jobs.push(jellyfin.refreshJellyfinLibrary());
  await Promise.all(jobs);
}

export async function getWatchedMovies(): Promise<WatchedMovie[]> {
  const [p, j] = await Promise.all([
    plexEnabled() ? plex.getPlexWatchedMovies() : Promise.resolve([]),
    jellyfinEnabled() ? jellyfin.getJellyfinWatchedMovies() : Promise.resolve([]),
  ]);
  return [...p, ...j];
}

export async function getInProgressMovies(): Promise<InProgressMovie[]> {
  const [p, j] = await Promise.all([
    plexEnabled() ? plex.getPlexInProgressMovies() : Promise.resolve([]),
    jellyfinEnabled() ? jellyfin.getJellyfinInProgressMovies() : Promise.resolve([]),
  ]);
  return [...p, ...j];
}

export async function getEpisodeWatchHistory(limit = 30): Promise<WatchedEpisode[]> {
  const [p, j] = await Promise.all([
    plexEnabled() ? plex.getPlexEpisodeWatchHistory(limit) : Promise.resolve([]),
    jellyfinEnabled() ? jellyfin.getJellyfinEpisodeWatchHistory(limit) : Promise.resolve([]),
  ]);
  return [...p, ...j]
    .sort((a, b) => new Date(b.viewedAt).getTime() - new Date(a.viewedAt).getTime())
    .slice(0, limit);
}

export async function getPlayedSessionKeys(limit = 200): Promise<Set<string>> {
  const [p, j] = await Promise.all([
    plexEnabled() ? plex.getPlexPlayedSessionKeys(limit) : Promise.resolve(new Set<string>()),
    jellyfinEnabled() ? jellyfin.getJellyfinPlayedSessionKeys(limit) : Promise.resolve(new Set<string>()),
  ]);
  return new Set([...Array.from(p), ...Array.from(j)]);
}

/** Structured form of getPlayedSessionKeys - genuine logged-playback events from both backends, which (unlike getEpisodeWatchHistory) survive the episode's file being deleted, so a watched-then-deleted episode can still be recognized as watched. */
export async function getPlayedEpisodes(limit = 200): Promise<PlayedEpisode[]> {
  const [p, j] = await Promise.all([
    plexEnabled() ? plex.getPlexPlayedEpisodes(limit) : Promise.resolve([]),
    jellyfinEnabled() ? jellyfin.getJellyfinPlayedEpisodes(limit) : Promise.resolve([]),
  ]);
  return [...p, ...j];
}

export async function getInProgressEpisodes(): Promise<InProgressEpisode[]> {
  const [p, j] = await Promise.all([
    plexEnabled() ? plex.getPlexInProgressEpisodes() : Promise.resolve([]),
    jellyfinEnabled() ? jellyfin.getJellyfinInProgressEpisodes() : Promise.resolve([]),
  ]);
  return [...p, ...j];
}
