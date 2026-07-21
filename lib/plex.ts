const PLEX_URL = process.env.PLEX_URL;
const PLEX_TOKEN = process.env.PLEX_TOKEN;

interface PlexHub {
  type?: string;
  Metadata?: { title?: string; ratingKey?: string }[];
}

// Plex's search doesn't fuzzy-match extra tokens — a query like
// "The 1% Club (US)" returns zero results even though Plex has it stored
// as just "The 1% Club". Strip the trailing disambiguator Sonarr/Radarr
// append (country, year) before searching.
function stripDisambiguator(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

function titleMatches(itemTitle: string, normalized: string): boolean {
  if (!itemTitle) return false;
  return itemTitle === normalized || itemTitle.includes(normalized) || normalized.includes(itemTitle);
}

async function searchPlex(query: string): Promise<PlexHub[]> {
  // /search only returns the list of search categories, not actual matches —
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
  const normalized = searchQuery.toLowerCase().trim();
  return items.some((item) => titleMatches((item.title ?? '').toLowerCase().trim(), normalized));
}

/** True if this specific season/episode of the show has actually been scanned into Plex — not just the show existing. */
export async function plexHasEpisode(showTitle: string, seasonNumber: number, episodeNumber: number): Promise<boolean> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const searchQuery = stripDisambiguator(showTitle);
  const hubs = await searchPlex(searchQuery);
  const showHub = hubs.find((h) => h.type === 'show');
  const shows = showHub?.Metadata ?? [];

  const normalized = searchQuery.toLowerCase().trim();
  const matchedShow = shows.find((item) => titleMatches((item.title ?? '').toLowerCase().trim(), normalized));
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

export interface WatchedEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewedAt: string;
}

let tvSectionKeyCache: string | null | undefined;

async function getTvSectionKey(): Promise<string | null> {
  if (tvSectionKeyCache !== undefined) return tvSectionKeyCache;
  const res = await fetch(`${PLEX_URL}/library/sections?X-Plex-Token=${PLEX_TOKEN}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex sections failed: ${res.status}`);
  const data = await res.json();
  const sections: { key?: string; type?: string }[] = data.MediaContainer?.Directory ?? [];
  tvSectionKeyCache = sections.find((s) => s.type === 'show')?.key ?? null;
  return tvSectionKeyCache;
}

/**
 * Recently watched episodes, queried directly by viewCount/lastViewedAt on
 * the TV library section. Deliberately NOT using Plex's session-history log
 * (/status/sessions/history/all) — that only records actual playback
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

export interface InProgressEpisode {
  showTitle: string;
  seasonNumber: number;
  episodeNumber: number;
  viewOffset: number;
  duration: number;
}

/** Episodes currently mid-playback per Plex's "on deck" list, with the raw viewOffset/duration Plex itself tracks — no history-log event required. */
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
