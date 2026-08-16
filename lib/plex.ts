import { titlesMatch } from './titleMatch';

// Stripped of any trailing slash - otherwise a URL saved as "http://host:32400/"
// produces double-slash paths (".../hubs/search" -> "..//hubs/search") that 404.
const PLEX_URL = process.env.PLEX_URL?.replace(/\/$/, '');
const PLEX_TOKEN = process.env.PLEX_TOKEN;

interface PlexHub {
  type?: string;
  Metadata?: { title?: string; ratingKey?: string }[];
}

// Plex's search doesn't fuzzy-match extra tokens - a query like
// "The 1% Club (US)" returns zero results even though Plex has it stored
// as just "The 1% Club". Strip the trailing disambiguator Sonarr/Radarr
// append (country, year) before searching.
function stripDisambiguator(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Matching is strict equality-after-normalization (see lib/titleMatch.ts) -
// the old bidirectional substring version here could scrobble/act on the
// wrong library item ("It" matched anything containing "it").

async function searchPlex(query: string): Promise<PlexHub[]> {
  // /search only returns the list of search categories, not actual matches -
  // /hubs/search (what Plex's own apps use) returns real results, grouped
  // into per-type Hub entries (movie, show, episode, ...).
  const res = await fetch(`${PLEX_URL}/hubs/search?query=${encodeURIComponent(query)}&X-Plex-Token=${PLEX_TOKEN}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex search failed: ${res.status}`);
  const data = await res.json();
  return data.MediaContainer?.Hub ?? [];
}

/** True if a title matching (or containing) the given name exists anywhere in the Plex library. */
export async function plexHasTitle(title: string): Promise<boolean> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const searchQuery = stripDisambiguator(title);
  const hubs = await searchPlex(searchQuery);
  const items = hubs.flatMap((hub) => hub.Metadata ?? []);
  return items.some((item) => titlesMatch(item.title ?? '', searchQuery));
}

/** True if this specific season/episode of the show has actually been scanned into Plex - not just the show existing. */
export async function plexHasEpisode(showTitle: string, seasonNumber: number, episodeNumber: number): Promise<boolean> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const searchQuery = stripDisambiguator(showTitle);
  const hubs = await searchPlex(searchQuery);
  const showHub = hubs.find((h) => h.type === 'show');
  const shows = showHub?.Metadata ?? [];

  const matchedShow = shows.find((item) => titlesMatch(item.title ?? '', searchQuery));
  if (!matchedShow?.ratingKey) return false;

  const episodesRes = await fetch(
    `${PLEX_URL}/library/metadata/${matchedShow.ratingKey}/allLeaves?X-Plex-Token=${PLEX_TOKEN}`,
    { headers: { Accept: 'application/json' }, cache: 'no-store' }
  );
  if (!episodesRes.ok) throw new Error(`Plex episode lookup failed: ${episodesRes.status}`);
  const episodesData = await episodesRes.json();
  const episodes: { parentIndex?: number; index?: number }[] = episodesData.MediaContainer?.Metadata ?? [];

  return episodes.some((ep) => ep.parentIndex === seasonNumber && ep.index === episodeNumber);
}

/** Marks a single Plex item (movie or episode) as watched via its ratingKey. */
async function scrobble(ratingKey: string): Promise<void> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');
  const res = await fetch(
    `${PLEX_URL}/:/scrobble?key=${ratingKey}&identifier=com.plexapp.plugins.library&X-Plex-Token=${PLEX_TOKEN}`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Plex scrobble failed: ${res.status}`);
}

/** Marks an already-resolved Plex item watched - for callers (watchedSync) that matched it by provider id instead of title search. */
export async function markPlexRatingKeyWatched(ratingKey: string): Promise<void> {
  await scrobble(ratingKey);
}

/** Resolves a movie title to its Plex ratingKey and marks it watched. */
export async function markPlexMovieWatched(title: string): Promise<void> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const searchQuery = stripDisambiguator(title);
  const hubs = await searchPlex(searchQuery);
  const movieHub = hubs.find((h) => h.type === 'movie');
  const movies = movieHub?.Metadata ?? [];
  const matched = movies.find((item) => titlesMatch(item.title ?? '', searchQuery));
  if (!matched?.ratingKey) throw new Error(`Could not find "${title}" in Plex`);

  await scrobble(matched.ratingKey);
}

/** Resolves specific season/episode numbers of a show to their Plex ratingKeys and marks each watched. */
export async function markPlexEpisodesWatched(
  showTitle: string,
  episodes: { seasonNumber: number; episodeNumber: number }[]
): Promise<void> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const searchQuery = stripDisambiguator(showTitle);
  const hubs = await searchPlex(searchQuery);
  const showHub = hubs.find((h) => h.type === 'show');
  const shows = showHub?.Metadata ?? [];
  const matchedShow = shows.find((item) => titlesMatch(item.title ?? '', searchQuery));
  if (!matchedShow?.ratingKey) throw new Error(`Could not find "${showTitle}" in Plex`);

  await markPlexShowEpisodesWatchedByKey(matchedShow.ratingKey, episodes, showTitle);
}

/** Same as markPlexEpisodesWatched but for a show already resolved to its ratingKey (watchedSync matches shows by provider id, not title search). */
export async function markPlexShowEpisodesWatchedByKey(
  showRatingKey: string,
  episodes: { seasonNumber: number; episodeNumber: number }[],
  showTitle = 'show'
): Promise<void> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const episodesRes = await fetch(
    `${PLEX_URL}/library/metadata/${showRatingKey}/allLeaves?X-Plex-Token=${PLEX_TOKEN}`,
    { headers: { Accept: 'application/json' }, cache: 'no-store' }
  );
  if (!episodesRes.ok) throw new Error(`Plex episode lookup failed: ${episodesRes.status}`);
  const episodesData = await episodesRes.json();
  const allEpisodes: { parentIndex?: number; index?: number; ratingKey?: string }[] =
    episodesData.MediaContainer?.Metadata ?? [];

  const wanted = new Set(episodes.map((e) => `${e.seasonNumber}:${e.episodeNumber}`));
  const ratingKeys = allEpisodes
    .filter((e) => e.parentIndex !== undefined && e.index !== undefined && wanted.has(`${e.parentIndex}:${e.index}`) && e.ratingKey)
    .map((e) => e.ratingKey as string);

  if (ratingKeys.length === 0) throw new Error(`Could not find those episodes of "${showTitle}" in Plex`);
  await Promise.all(ratingKeys.map((rk) => scrobble(rk)));
}

export interface WatchedEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
}

const sectionKeyCache = new Map<string, string | null>();

async function getSectionKey(type: 'show' | 'movie'): Promise<string | null> {
  if (sectionKeyCache.has(type)) return sectionKeyCache.get(type)!;
  const res = await fetch(`${PLEX_URL}/library/sections?X-Plex-Token=${PLEX_TOKEN}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex sections failed: ${res.status}`);
  const data = await res.json();
  const sections: { key?: string; type?: string }[] = data.MediaContainer?.Directory ?? [];
  const key = sections.find((s) => s.type === type)?.key ?? null;
  sectionKeyCache.set(type, key);
  return key;
}

async function getTvSectionKey(): Promise<string | null> {
  return getSectionKey('show');
}

/** Tells Plex to rescan the movie library (e.g. after deleting a movie elsewhere) so it notices the file is gone right away instead of waiting for its next scheduled scan. */
export async function refreshPlexMovieLibrary(): Promise<void> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');
  const sectionKey = await getSectionKey('movie');
  if (!sectionKey) return;
  const res = await fetch(`${PLEX_URL}/library/sections/${sectionKey}/refresh?X-Plex-Token=${PLEX_TOKEN}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex library refresh failed: ${res.status}`);
}

/** Tells Plex to rescan the TV library (e.g. after deleting a show elsewhere) so it notices right away instead of waiting for its next scheduled scan. */
export async function refreshPlexTvLibrary(): Promise<void> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');
  const sectionKey = await getTvSectionKey();
  if (!sectionKey) return;
  const res = await fetch(`${PLEX_URL}/library/sections/${sectionKey}/refresh?X-Plex-Token=${PLEX_TOKEN}`, {
    method: 'GET',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex library refresh failed: ${res.status}`);
}

export interface ProviderIds {
  tmdbId: number | null;
  imdbId: string | null;
  tvdbId: number | null;
}

// Section listings return Guid entries like {id: "tmdb://1891"} when asked
// with includeGuids=1 - same id scheme the watchlist code parses.
function extractGuidIds(guids: { id?: string }[] | undefined): ProviderIds {
  const ids: ProviderIds = { tmdbId: null, imdbId: null, tvdbId: null };
  for (const g of guids ?? []) {
    if (g.id?.startsWith('tmdb://')) ids.tmdbId = Number(g.id.slice('tmdb://'.length)) || null;
    if (g.id?.startsWith('imdb://')) ids.imdbId = g.id.slice('imdb://'.length) || null;
    if (g.id?.startsWith('tvdb://')) ids.tvdbId = Number(g.id.slice('tvdb://'.length)) || null;
  }
  return ids;
}

export interface PlexLibraryItem extends ProviderIds {
  ratingKey: string;
  title: string;
  watched: boolean;
}

async function getAllPlexItemsWithIds(sectionType: 'movie' | 'show', itemType: 1 | 2): Promise<PlexLibraryItem[]> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');
  const sectionKey = await getSectionKey(sectionType);
  if (!sectionKey) return [];

  const res = await fetch(
    `${PLEX_URL}/library/sections/${sectionKey}/all?type=${itemType}&includeGuids=1&X-Plex-Container-Start=0&X-Plex-Container-Size=2000&X-Plex-Token=${PLEX_TOKEN}`,
    { headers: { Accept: 'application/json' }, cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Plex library listing failed: ${res.status}`);
  const data = await res.json();
  const items: Record<string, unknown>[] = data.MediaContainer?.Metadata ?? [];
  return items
    .filter((i) => i.title && i.ratingKey)
    .map((i) => ({
      ratingKey: String(i.ratingKey),
      title: i.title as string,
      watched: ((i.viewCount as number) ?? 0) > 0,
      ...extractGuidIds(i.Guid as { id?: string }[] | undefined),
    }));
}

/** Every movie in the Plex library with its provider ids and watched flag - lets watchedSync match against Jellyfin by TMDB/IMDB id instead of display title. */
export async function getAllPlexMoviesWithIds(): Promise<PlexLibraryItem[]> {
  return getAllPlexItemsWithIds('movie', 1);
}

/** Every show in the Plex library with its provider ids - watchedSync resolves shows across servers by id, then matches episodes by season/episode number. */
export async function getAllPlexShowsWithIds(): Promise<PlexLibraryItem[]> {
  return getAllPlexItemsWithIds('show', 2);
}

export interface WatchedMovie {
  title: string;
  lastViewedAt: string;
}

/** Movies with viewCount>=1 in the movie library section, with when they were last watched. */
export async function getPlexWatchedMovies(): Promise<WatchedMovie[]> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');
  const sectionKey = await getSectionKey('movie');
  if (!sectionKey) return [];

  const res = await fetch(
    `${PLEX_URL}/library/sections/${sectionKey}/all?type=1&viewCount%3E=1&X-Plex-Container-Start=0&X-Plex-Container-Size=1000&X-Plex-Token=${PLEX_TOKEN}`,
    { headers: { Accept: 'application/json' }, cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Plex watched movies failed: ${res.status}`);
  const data = await res.json();
  const items: Record<string, unknown>[] = data.MediaContainer?.Metadata ?? [];
  return items
    .filter((i) => i.title && i.lastViewedAt)
    .map((i) => ({
      title: i.title as string,
      lastViewedAt: new Date((i.lastViewedAt as number) * 1000).toISOString(),
    }));
}

export interface InProgressMovie {
  title: string;
  viewOffset: number;
  duration: number;
}

/** Movies currently mid-playback per Plex's "on deck" list - the movie-side equivalent of getPlexInProgressEpisodes. */
export async function getPlexInProgressMovies(): Promise<InProgressMovie[]> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const res = await fetch(`${PLEX_URL}/library/onDeck?X-Plex-Token=${PLEX_TOKEN}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex on deck failed: ${res.status}`);
  const data = await res.json();
  const items: Record<string, unknown>[] = data.MediaContainer?.Metadata ?? [];

  return items
    .filter((i) => i.type === 'movie' && i.title && typeof i.viewOffset === 'number' && typeof i.duration === 'number')
    .map((i) => ({
      title: i.title as string,
      viewOffset: i.viewOffset as number,
      duration: i.duration as number,
    }));
}

/**
 * Recently watched episodes, queried directly by viewCount/lastViewedAt on
 * the TV library section. Deliberately NOT using Plex's session-history log
 * (/status/sessions/history/all) - that only records actual playback
 * sessions, so manually marking an episode "watched" (no playback involved)
 * never shows up there even though it does set viewCount/lastViewedAt.
 */
export async function getPlexEpisodeWatchHistory(limit = 30): Promise<WatchedEpisode[]> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const sectionKey = await getTvSectionKey();
  if (!sectionKey) return [];

  const res = await fetch(
    `${PLEX_URL}/library/sections/${sectionKey}/all?type=4&viewCount%3E=1&sort=lastViewedAt:desc&X-Plex-Container-Start=0&X-Plex-Container-Size=${limit}&X-Plex-Token=${PLEX_TOKEN}`,
    { headers: { Accept: 'application/json' }, cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Plex watched episodes failed: ${res.status}`);
  const data = await res.json();
  const items: Record<string, unknown>[] = data.MediaContainer?.Metadata ?? [];

  return items
    .filter((i) => i.grandparentTitle && i.parentIndex !== undefined && i.index !== undefined && i.lastViewedAt)
    .map((i) => ({
      showTitle: i.grandparentTitle as string,
      seasonNumber: i.parentIndex as number,
      episodeNumber: i.index as number,
      viewedAt: new Date((i.lastViewedAt as number) * 1000).toISOString(),
    }));
}

/** Used by getPlexPlayedSessionKeys - /status/sessions/history/all is a genuine event log, unlike getPlexEpisodeWatchHistory's live-library-listing query. */
async function getPlexPlaySessions(limit: number): Promise<Record<string, unknown>[]> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');
  const res = await fetch(
    `${PLEX_URL}/status/sessions/history/all?X-Plex-Token=${PLEX_TOKEN}&sort=viewedAt:desc&limit=${limit}`,
    { headers: { Accept: 'application/json' }, cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Plex session history failed: ${res.status}`);
  const data = await res.json();
  return data.MediaContainer?.Metadata ?? [];
}

/**
 * Set of "showTitle:season:episode" keys with an actual logged playback
 * session - used only to tell "really watched" apart from "manually marked
 * watched" (which sets viewCount/lastViewedAt but never hits this log).
 */
export async function getPlexPlayedSessionKeys(limit = 200): Promise<Set<string>> {
  const items = await getPlexPlaySessions(limit);
  const keys = new Set<string>();
  for (const i of items) {
    if (i.type === 'episode' && i.grandparentTitle && i.parentIndex !== undefined && i.index !== undefined) {
      keys.add(`${(i.grandparentTitle as string).toLowerCase().trim()}:${i.parentIndex}:${i.index}`);
    }
  }
  return keys;
}

export interface InProgressEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewOffset: number;
  duration: number;
}

/** Episodes currently mid-playback per Plex's "on deck" list, with the raw viewOffset/duration Plex itself tracks - no history-log event required. */
export async function getPlexInProgressEpisodes(): Promise<InProgressEpisode[]> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const res = await fetch(`${PLEX_URL}/library/onDeck?X-Plex-Token=${PLEX_TOKEN}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex on deck failed: ${res.status}`);
  const data = await res.json();
  const items: Record<string, unknown>[] = data.MediaContainer?.Metadata ?? [];

  return items
    .filter((i) =>
      i.type === 'episode' &&
      i.grandparentTitle &&
      i.parentIndex !== undefined &&
      i.index !== undefined &&
      typeof i.viewOffset === 'number' &&
      typeof i.duration === 'number'
    )
    .map((i) => ({
      showTitle: i.grandparentTitle as string,
      seasonNumber: i.parentIndex as number,
      episodeNumber: i.index as number,
      viewOffset: i.viewOffset as number,
      duration: i.duration as number,
    }));
}
