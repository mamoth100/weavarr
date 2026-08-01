const JELLYFIN_URL = process.env.JELLYFIN_URL;
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY;
const JELLYFIN_USER_ID = process.env.JELLYFIN_USER_ID;

function headers() {
  return { 'X-Emby-Token': JELLYFIN_API_KEY as string, Accept: 'application/json' };
}

function requireConfig(): void {
  if (!JELLYFIN_URL || !JELLYFIN_API_KEY || !JELLYFIN_USER_ID) throw new Error('Jellyfin is not configured');
}

// Mirrors Plex's stripDisambiguator - Sonarr/Radarr title suffixes like
// "(US)" or "(2020)" don't help Jellyfin's search either.
function stripDisambiguator(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function titleMatches(itemName: string, normalized: string): boolean {
  if (!itemName) return false;
  const n = itemName.toLowerCase().trim();
  return n === normalized || n.includes(normalized) || normalized.includes(n);
}

interface JellyfinItem {
  Id?: string;
  Name?: string;
  Type?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  UserData?: {
    Played?: boolean;
    LastPlayedDate?: string;
    PlaybackPositionTicks?: number;
  };
  RunTimeTicks?: number;
}

async function searchJellyfin(query: string, itemType: 'Movie' | 'Series' | 'Episode'): Promise<JellyfinItem[]> {
  const params = new URLSearchParams({
    searchTerm: query,
    IncludeItemTypes: itemType,
    Recursive: 'true',
    userId: JELLYFIN_USER_ID as string,
    Fields: 'UserData',
  });
  const res = await fetch(`${JELLYFIN_URL}/Items?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Jellyfin search failed: ${res.status}`);
  const data = await res.json();
  return (data.Items as JellyfinItem[] | undefined) ?? [];
}

/** True if a title matching (or containing) the given name exists anywhere in the Jellyfin library. */
export async function jellyfinHasTitle(title: string): Promise<boolean> {
  requireConfig();
  const searchQuery = stripDisambiguator(title);
  const items = await searchJellyfin(searchQuery, 'Movie');
  const shows = await searchJellyfin(searchQuery, 'Series');
  const normalized = searchQuery.toLowerCase().trim();
  return [...items, ...shows].some((item) => titleMatches(item.Name ?? '', normalized));
}

/** True if this specific season/episode of the show has actually been scanned into Jellyfin - not just the show existing. */
export async function jellyfinHasEpisode(showTitle: string, seasonNumber: number, episodeNumber: number): Promise<boolean> {
  requireConfig();
  const searchQuery = stripDisambiguator(showTitle);
  const shows = await searchJellyfin(searchQuery, 'Series');
  const normalized = searchQuery.toLowerCase().trim();
  const matchedShow = shows.find((s) => titleMatches(s.Name ?? '', normalized));
  if (!matchedShow?.Id) return false;

  const episodes = await getSeriesEpisodes(matchedShow.Id);
  return episodes.some((ep) => ep.ParentIndexNumber === seasonNumber && ep.IndexNumber === episodeNumber);
}

async function getSeriesEpisodes(seriesId: string): Promise<JellyfinItem[]> {
  const params = new URLSearchParams({
    userId: JELLYFIN_USER_ID as string,
    Fields: 'UserData',
  });
  const res = await fetch(`${JELLYFIN_URL}/Shows/${seriesId}/Episodes?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Jellyfin episode lookup failed: ${res.status}`);
  const data = await res.json();
  return (data.Items as JellyfinItem[] | undefined) ?? [];
}

async function markPlayed(itemId: string): Promise<void> {
  const res = await fetch(`${JELLYFIN_URL}/Users/${JELLYFIN_USER_ID}/PlayedItems/${itemId}`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Jellyfin mark-played failed: ${res.status}`);
}

/** Resolves a movie title to its Jellyfin item id and marks it watched. */
export async function markJellyfinMovieWatched(title: string): Promise<void> {
  requireConfig();
  const searchQuery = stripDisambiguator(title);
  const items = await searchJellyfin(searchQuery, 'Movie');
  const normalized = searchQuery.toLowerCase().trim();
  const matched = items.find((item) => titleMatches(item.Name ?? '', normalized));
  if (!matched?.Id) throw new Error(`Could not find "${title}" in Jellyfin`);
  await markPlayed(matched.Id);
}

/** Resolves specific season/episode numbers of a show to their Jellyfin item ids and marks each watched. */
export async function markJellyfinEpisodesWatched(
  showTitle: string,
  episodes: { seasonNumber: number; episodeNumber: number }[]
): Promise<void> {
  requireConfig();
  const searchQuery = stripDisambiguator(showTitle);
  const shows = await searchJellyfin(searchQuery, 'Series');
  const normalized = searchQuery.toLowerCase().trim();
  const matchedShow = shows.find((s) => titleMatches(s.Name ?? '', normalized));
  if (!matchedShow?.Id) throw new Error(`Could not find "${showTitle}" in Jellyfin`);

  const allEpisodes = await getSeriesEpisodes(matchedShow.Id);
  const wanted = new Set(episodes.map((e) => `${e.seasonNumber}:${e.episodeNumber}`));
  const ids = allEpisodes
    .filter((e) => e.ParentIndexNumber !== undefined && e.IndexNumber !== undefined && wanted.has(`${e.ParentIndexNumber}:${e.IndexNumber}`) && e.Id)
    .map((e) => e.Id as string);

  if (ids.length === 0) throw new Error(`Could not find those episodes of "${showTitle}" in Jellyfin`);
  await Promise.all(ids.map((id) => markPlayed(id)));
}

/** Tells Jellyfin to rescan its libraries (e.g. after deleting a movie elsewhere). Jellyfin has no clean per-library-type refresh like Plex's per-section refresh, so this triggers a full library scan for both movie and TV refresh calls. */
export async function refreshJellyfinLibrary(): Promise<void> {
  requireConfig();
  const res = await fetch(`${JELLYFIN_URL}/Library/Refresh`, { method: 'POST', headers: headers() });
  if (!res.ok) throw new Error(`Jellyfin library refresh failed: ${res.status}`);
}

export interface JellyfinWatchedMovie {
  title: string;
  lastViewedAt: string;
}

/** Movies marked Played for the configured user, with when they were last watched. */
export async function getJellyfinWatchedMovies(): Promise<JellyfinWatchedMovie[]> {
  requireConfig();
  const params = new URLSearchParams({
    userId: JELLYFIN_USER_ID as string,
    IncludeItemTypes: 'Movie',
    Filters: 'IsPlayed',
    Recursive: 'true',
    Fields: 'UserData',
  });
  const res = await fetch(`${JELLYFIN_URL}/Items?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Jellyfin watched movies failed: ${res.status}`);
  const data = await res.json();
  const items: JellyfinItem[] = data.Items ?? [];
  return items
    .filter((i) => i.Name && i.UserData?.LastPlayedDate)
    .map((i) => ({ title: i.Name as string, lastViewedAt: i.UserData!.LastPlayedDate as string }));
}

export interface JellyfinInProgressMovie {
  title: string;
  viewOffset: number;
  duration: number;
}

/** Movies currently mid-playback per Jellyfin's Resume list - viewOffset/duration converted from ticks to ms to match Plex's units. */
export async function getJellyfinInProgressMovies(): Promise<JellyfinInProgressMovie[]> {
  requireConfig();
  const params = new URLSearchParams({ IncludeItemTypes: 'Movie', Recursive: 'true', Fields: 'UserData' });
  const res = await fetch(`${JELLYFIN_URL}/Users/${JELLYFIN_USER_ID}/Items/Resume?${params}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Jellyfin resume list failed: ${res.status}`);
  const data = await res.json();
  const items: JellyfinItem[] = data.Items ?? [];
  return items
    .filter((i) => i.Name && i.RunTimeTicks && i.UserData?.PlaybackPositionTicks)
    .map((i) => ({
      title: i.Name as string,
      viewOffset: Math.round((i.UserData!.PlaybackPositionTicks as number) / 10000),
      duration: Math.round((i.RunTimeTicks as number) / 10000),
    }));
}

export interface JellyfinWatchedEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
}

/** Recently watched episodes for the configured user, most recent first. */
export async function getJellyfinEpisodeWatchHistory(limit = 30): Promise<JellyfinWatchedEpisode[]> {
  requireConfig();
  const params = new URLSearchParams({
    userId: JELLYFIN_USER_ID as string,
    IncludeItemTypes: 'Episode',
    Filters: 'IsPlayed',
    Recursive: 'true',
    SortBy: 'DatePlayed',
    SortOrder: 'Descending',
    Limit: String(limit),
    Fields: 'UserData',
  });
  const res = await fetch(`${JELLYFIN_URL}/Items?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Jellyfin watched episodes failed: ${res.status}`);
  const data = await res.json();
  const items: JellyfinItem[] = data.Items ?? [];
  return items
    .filter((i) => i.SeriesName && i.ParentIndexNumber !== undefined && i.IndexNumber !== undefined && i.UserData?.LastPlayedDate)
    .map((i) => ({
      showTitle: i.SeriesName as string,
      seasonNumber: i.ParentIndexNumber as number,
      episodeNumber: i.IndexNumber as number,
      viewedAt: i.UserData!.LastPlayedDate as string,
    }));
}

/**
 * Jellyfin doesn't expose a separate "actual playback session" log the way
 * Plex's session-history endpoint does (that would need the Playback
 * Reporting plugin) - IsPlayed is the only signal available, so this can't
 * distinguish "really watched" from "manually marked watched" for Jellyfin.
 * Returns the same keys as the watched-episode list.
 */
export async function getJellyfinPlayedSessionKeys(limit = 200): Promise<Set<string>> {
  const history = await getJellyfinEpisodeWatchHistory(limit);
  return new Set(history.map((h) => `${h.showTitle.toLowerCase().trim()}:${h.seasonNumber}:${h.episodeNumber}`));
}

export interface JellyfinInProgressEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewOffset: number;
  duration: number;
}

/** Episodes currently mid-playback per Jellyfin's Resume list. */
export async function getJellyfinInProgressEpisodes(): Promise<JellyfinInProgressEpisode[]> {
  requireConfig();
  const params = new URLSearchParams({ IncludeItemTypes: 'Episode', Recursive: 'true', Fields: 'UserData' });
  const res = await fetch(`${JELLYFIN_URL}/Users/${JELLYFIN_USER_ID}/Items/Resume?${params}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Jellyfin resume list failed: ${res.status}`);
  const data = await res.json();
  const items: JellyfinItem[] = data.Items ?? [];
  return items
    .filter((i) => i.SeriesName && i.ParentIndexNumber !== undefined && i.IndexNumber !== undefined && i.RunTimeTicks && i.UserData?.PlaybackPositionTicks)
    .map((i) => ({
      showTitle: i.SeriesName as string,
      seasonNumber: i.ParentIndexNumber as number,
      episodeNumber: i.IndexNumber as number,
      viewOffset: Math.round((i.UserData!.PlaybackPositionTicks as number) / 10000),
      duration: Math.round((i.RunTimeTicks as number) / 10000),
    }));
}
