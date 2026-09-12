import { fetchWithTimeout } from './fetchTimeout';
import { titlesMatch } from './titleMatch';
import { jellyfinHeaders } from './jellyfinAuth';
// Stripped of any trailing slash - a URL saved with one (e.g. "http://host:8096/")
// would otherwise produce double-slash paths like ".../Users" -> "..//Users",
// which Jellyfin 404s on.
const JELLYFIN_URL = process.env.JELLYFIN_URL?.replace(/\/$/, '');
const JELLYFIN_API_KEY = process.env.JELLYFIN_API_KEY;
// Despite the env var's name, this is the Jellyfin *username* the user types in
// Settings (not the internal GUID Jellyfin actually needs) - resolveUserId
// looks that GUID up so nobody has to go dig it out of the dashboard/URLs.
const JELLYFIN_USERNAME = process.env.JELLYFIN_USER_ID;

function headers() {
  return jellyfinHeaders(JELLYFIN_API_KEY as string);
}

function requireConfig(): void {
  if (!JELLYFIN_URL || !JELLYFIN_API_KEY || !JELLYFIN_USERNAME) throw new Error('Jellyfin is not configured');
}

let cachedUserId: string | null = null;

/** Resolves the configured Jellyfin username to its internal user id (a GUID), via the admin Users listing. Cached for the life of the process - matches every other setting here needing a restart to pick up changes. */
async function resolveUserId(): Promise<string> {
  if (cachedUserId) return cachedUserId;
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/Users`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Jellyfin user lookup failed: ${res.status}`);
  const users: { Id?: string; Name?: string }[] = await res.json();
  const normalized = (JELLYFIN_USERNAME as string).toLowerCase().trim();
  const match = users.find((u) => (u.Name ?? '').toLowerCase().trim() === normalized);
  if (!match?.Id) throw new Error(`No Jellyfin user named "${JELLYFIN_USERNAME}" - check the username in Settings`);
  cachedUserId = match.Id;
  return cachedUserId;
}

// Mirrors Plex's stripDisambiguator - Sonarr/Radarr title suffixes like
// "(US)" or "(2020)" don't help Jellyfin's search either.
function stripDisambiguator(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Matching is strict equality-after-normalization (see lib/titleMatch.ts) -
// the old bidirectional substring version here matched wrong-but-similar
// titles and fed mark-watched/lookup calls with the wrong item.

interface JellyfinItem {
  Id?: string;
  Name?: string;
  Type?: string;
  SeriesName?: string;
  ParentIndexNumber?: number;
  IndexNumber?: number;
  // Jellyfin stores a double-length episode file as ONE item spanning a
  // range (e.g. Friends S9E23-24 "The One in Barbados" has IndexNumber 23,
  // IndexNumberEnd 24), while Plex lists each number separately - episode
  // matching has to treat the item as covering every number in the range.
  IndexNumberEnd?: number;
  PremiereDate?: string;
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
    userId: await resolveUserId(),
    Fields: 'UserData',
  });
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/Items?${params}`, { headers: headers(), cache: 'no-store' });
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
  return [...items, ...shows].some((item) => titlesMatch(item.Name ?? '', searchQuery));
}

/** True if this specific season/episode of the show has actually been scanned into Jellyfin - not just the show existing. */
export async function jellyfinHasEpisode(showTitle: string, seasonNumber: number, episodeNumber: number, airDate?: string | null): Promise<boolean> {
  requireConfig();
  const searchQuery = stripDisambiguator(showTitle);
  const shows = await searchJellyfin(searchQuery, 'Series');
  const matchedShow = shows.find((s) => titlesMatch(s.Name ?? '', searchQuery));
  if (!matchedShow?.Id) return false;

  const episodes = await getSeriesEpisodes(matchedShow.Id);
  if (episodes.some((ep) => episodeCovers(ep, seasonNumber, episodeNumber))) return true;
  // Jellyfin's agent can number seasons differently than TVDB/Sonarr - an
  // episode with the same air date counts, since air dates survive renumbering.
  return Boolean(airDate) && episodes.some((ep) => typeof ep.PremiereDate === 'string' && ep.PremiereDate.slice(0, 10) === airDate);
}

/** Whether this Jellyfin episode item covers the given season/episode number, including double episodes spanning IndexNumber..IndexNumberEnd. */
function episodeCovers(ep: JellyfinItem, seasonNumber: number, episodeNumber: number): boolean {
  if (ep.ParentIndexNumber !== seasonNumber || ep.IndexNumber === undefined) return false;
  const end = ep.IndexNumberEnd ?? ep.IndexNumber;
  return episodeNumber >= ep.IndexNumber && episodeNumber <= end;
}

async function getSeriesEpisodes(seriesId: string): Promise<JellyfinItem[]> {
  const params = new URLSearchParams({
    userId: await resolveUserId(),
    Fields: 'UserData,PremiereDate',
  });
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/Shows/${seriesId}/Episodes?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Jellyfin episode lookup failed: ${res.status}`);
  const data = await res.json();
  return (data.Items as JellyfinItem[] | undefined) ?? [];
}

/**
 * datePlayed: when the watch actually happened. Without it Jellyfin stamps
 * "now", so a months-old Plex watch relayed by the sync showed up as watched
 * today and sat at the top of Recently Watched (and the Chopping Block).
 */
async function markPlayed(itemId: string, datePlayed?: string): Promise<void> {
  const userId = await resolveUserId();
  const query = datePlayed ? `?datePlayed=${encodeURIComponent(datePlayed)}` : '';
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/Users/${userId}/PlayedItems/${itemId}${query}`, {
    method: 'POST',
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Jellyfin mark-played failed: ${res.status}`);
}

/** Marks an already-resolved Jellyfin item watched - for callers (watchedSync) that matched it by provider id instead of title search. */
export async function markJellyfinItemWatched(itemId: string, datePlayed?: string): Promise<void> {
  requireConfig();
  await markPlayed(itemId, datePlayed);
}

/** Resolves a movie title to its Jellyfin item id and marks it watched. */
export async function markJellyfinMovieWatched(title: string): Promise<void> {
  requireConfig();
  const searchQuery = stripDisambiguator(title);
  const items = await searchJellyfin(searchQuery, 'Movie');
  const matched = items.find((item) => titlesMatch(item.Name ?? '', searchQuery));
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
  const matchedShow = shows.find((s) => titlesMatch(s.Name ?? '', searchQuery));
  if (!matchedShow?.Id) throw new Error(`Could not find "${showTitle}" in Jellyfin`);

  await markJellyfinSeriesEpisodesWatchedById(matchedShow.Id, episodes, showTitle);
}

/** Same as markJellyfinEpisodesWatched but for a series already resolved to its item id (watchedSync matches shows by provider id, not title search). */
export async function markJellyfinSeriesEpisodesWatchedById(
  seriesId: string,
  episodes: { seasonNumber: number; episodeNumber: number }[],
  showTitle = 'show',
  datePlayed?: string
): Promise<void> {
  requireConfig();
  const allEpisodes = await getSeriesEpisodes(seriesId);
  const ids = allEpisodes
    .filter((e) => e.Id && episodes.some((w) => episodeCovers(e, w.seasonNumber, w.episodeNumber)))
    .map((e) => e.Id as string);

  if (ids.length === 0) throw new Error(`Could not find those episodes of "${showTitle}" in Jellyfin`);
  await Promise.all(Array.from(new Set(ids)).map((id) => markPlayed(id, datePlayed)));
}

/** Tells Jellyfin to rescan its libraries (e.g. after deleting a movie elsewhere). Jellyfin has no clean per-library-type refresh like Plex's per-section refresh, so this triggers a full library scan for both movie and TV refresh calls. */
export async function refreshJellyfinLibrary(): Promise<void> {
  requireConfig();
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/Library/Refresh`, { method: 'POST', headers: headers() });
  if (!res.ok) throw new Error(`Jellyfin library refresh failed: ${res.status}`);
}

export interface JellyfinLibraryItem {
  id: string;
  title: string;
  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
  watched: boolean;
}

async function getAllJellyfinItemsWithIds(itemType: 'Movie' | 'Series'): Promise<JellyfinLibraryItem[]> {
  requireConfig();
  const params = new URLSearchParams({
    userId: await resolveUserId(),
    IncludeItemTypes: itemType,
    Recursive: 'true',
    Fields: 'ProviderIds,UserData',
  });
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/Items?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Jellyfin library listing failed: ${res.status}`);
  const data = await res.json();
  const items: (JellyfinItem & { ProviderIds?: Record<string, string> })[] = data.Items ?? [];
  return items
    .filter((i) => i.Id && i.Name)
    .map((i) => ({
      id: i.Id as string,
      title: i.Name as string,
      tmdbId: Number(i.ProviderIds?.Tmdb) || null,
      imdbId: i.ProviderIds?.Imdb || null,
      tvdbId: Number(i.ProviderIds?.Tvdb) || null,
      watched: i.UserData?.Played === true,
    }));
}

/** Every movie in the Jellyfin library with its provider ids and watched flag - lets watchedSync match against Plex by TMDB/IMDB id instead of display title. */
export async function getAllJellyfinMoviesWithIds(): Promise<JellyfinLibraryItem[]> {
  return getAllJellyfinItemsWithIds('Movie');
}

/** Every series in the Jellyfin library with its provider ids - watchedSync resolves shows across servers by id, then matches episodes by season/episode number. */
export async function getAllJellyfinShowsWithIds(): Promise<JellyfinLibraryItem[]> {
  return getAllJellyfinItemsWithIds('Series');
}

export interface JellyfinWatchedMovie {
  title: string;
  lastViewedAt: string;
}

/** Movies marked Played for the configured user, with when they were last watched. */
export async function getJellyfinWatchedMovies(): Promise<JellyfinWatchedMovie[]> {
  requireConfig();
  const params = new URLSearchParams({
    userId: await resolveUserId(),
    IncludeItemTypes: 'Movie',
    Filters: 'IsPlayed',
    Recursive: 'true',
    Fields: 'UserData',
  });
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/Items?${params}`, { headers: headers(), cache: 'no-store' });
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
  const userId = await resolveUserId();
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/Users/${userId}/Items/Resume?${params}`, {
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
    userId: await resolveUserId(),
    IncludeItemTypes: 'Episode',
    Filters: 'IsPlayed',
    Recursive: 'true',
    SortBy: 'DatePlayed',
    SortOrder: 'Descending',
    Limit: String(limit),
    Fields: 'UserData',
  });
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/Items?${params}`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Jellyfin watched episodes failed: ${res.status}`);
  const data = await res.json();
  const items: JellyfinItem[] = data.Items ?? [];
  // A watched double episode (IndexNumber..IndexNumberEnd) counts as every
  // number in its range - Plex lists those numbers as separate episodes, so
  // syncing only the start number would leave the rest unwatched there.
  return items
    .filter((i) => i.SeriesName && i.ParentIndexNumber !== undefined && i.IndexNumber !== undefined && i.UserData?.LastPlayedDate)
    .flatMap((i) => {
      const start = i.IndexNumber as number;
      const end = Math.min(i.IndexNumberEnd ?? start, start + 10);
      const out = [];
      for (let n = start; n <= end; n++) {
        out.push({
          showTitle: i.SeriesName as string,
          seasonNumber: i.ParentIndexNumber as number,
          episodeNumber: n,
          viewedAt: i.UserData!.LastPlayedDate as string,
        });
      }
      return out;
    });
}

/**
 * Jellyfin's core Activity Log (no plugin needed, unlike the third-party
 * Playback Reporting plugin) records a "finished playing" entry per
 * VideoPlaybackStopped event as a free-text line, e.g. "mamoth has finished
 * playing The King of Queens - The.King.Of.Queens.S02e02 on SHIELD Den". Note
 * this log has limited retention (rolls off after a while) so it's only
 * reliable for "was this a real playback vs a manual mark-watched" on items
 * still in the library, not as a durable record of anything ever watched.
 */
async function getJellyfinFinishedPlaybackEntries(limit: number): Promise<{ showTitle: string; seasonNumber: number; episodeNumber: number }[]> {
  requireConfig();
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/System/ActivityLog/Entries?limit=${limit}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Jellyfin activity log failed: ${res.status}`);
  const data = await res.json();
  const entries: { Name?: string; Type?: string }[] = data.Items ?? [];

  const results: { showTitle: string; seasonNumber: number; episodeNumber: number }[] = [];
  // Newer Jellyfin logs "{user} has finished playing {Show} - {Episode Name}
  // on {Device}" with NO SxxExx anywhere, so the numbered regex below never
  // matched and every Jellyfin play looked like a manual mark-watched.
  // Those entries collect here and get resolved to season/episode numbers
  // through each show's own episode list (matched by episode name).
  const nameBased = new Map<string, Set<string>>();
  for (const entry of entries) {
    if (entry.Type !== 'VideoPlaybackStopped' || !entry.Name) continue;
    const numbered = entry.Name.match(/has finished playing (.+?) - .*?[Ss](\d{1,2})[Ee](\d{1,3})/);
    if (numbered) {
      results.push({
        showTitle: numbered[1].trim(),
        seasonNumber: Number(numbered[2]),
        episodeNumber: Number(numbered[3]),
      });
      continue;
    }
    const named = entry.Name.match(/has finished playing (.+) on .+/);
    if (!named) continue;
    const label = named[1];
    const sep = label.indexOf(' - ');
    if (sep === -1) continue; // no show/episode split - a movie, not an episode
    const show = label.slice(0, sep).trim();
    const epName = label.slice(sep + 3).trim().toLowerCase();
    if (!show || !epName) continue;
    if (!nameBased.has(show)) nameBased.set(show, new Set());
    nameBased.get(show)!.add(epName);
  }

  for (const [show, epNames] of Array.from(nameBased.entries())) {
    try {
      const shows = await searchJellyfin(stripDisambiguator(show), 'Series');
      const matched = shows.find((s) => titlesMatch(s.Name ?? '', show));
      if (!matched?.Id) continue;
      const episodes = await getSeriesEpisodes(matched.Id);
      for (const ep of episodes) {
        if (
          ep.Name &&
          epNames.has(ep.Name.trim().toLowerCase()) &&
          ep.ParentIndexNumber !== undefined &&
          ep.IndexNumber !== undefined
        ) {
          results.push({ showTitle: show, seasonNumber: ep.ParentIndexNumber, episodeNumber: ep.IndexNumber });
        }
      }
    } catch {
      // One unresolvable show must not kill the whole played-session signal.
    }
  }
  return results;
}

/** Set of "showTitle:season:episode" keys with an actual logged "finished playing" event - used to tell "really watched" apart from "manually marked watched". */
export async function getJellyfinPlayedSessionKeys(limit = 200): Promise<Set<string>> {
  const played = await getJellyfinFinishedPlaybackEntries(limit);
  return new Set(played.map((p) => `${p.showTitle.toLowerCase().trim()}:${p.seasonNumber}:${p.episodeNumber}`));
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
  const userId = await resolveUserId();
  const res = await fetchWithTimeout(`${JELLYFIN_URL}/Users/${userId}/Items/Resume?${params}`, {
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
