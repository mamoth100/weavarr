const PLEX_URL = process.env.PLEX_URL;
const PLEX_TOKEN = process.env.PLEX_TOKEN;

interface PlexHub {
  Metadata?: { title?: string }[];
}

// Plex's search doesn't fuzzy-match extra tokens — a query like
// "The 1% Club (US)" returns zero results even though Plex has it stored
// as just "The 1% Club". Strip the trailing disambiguator Sonarr/Radarr
// append (country, year) before searching.
function stripDisambiguator(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/** True if a title matching (or containing) the given name exists anywhere in the Plex library. */
export async function plexHasTitle(title: string): Promise<boolean> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const searchQuery = stripDisambiguator(title);

  // /search only returns the list of search categories, not actual matches —
  // /hubs/search (what Plex's own apps use) returns real results, grouped
  // into per-type Hub entries (movie, show, episode, ...).
  const res = await fetch(`${PLEX_URL}/hubs/search?query=${encodeURIComponent(searchQuery)}&X-Plex-Token=${PLEX_TOKEN}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex search failed: ${res.status}`);
  const data = await res.json();
  const hubs: PlexHub[] = data.MediaContainer?.Hub ?? [];
  const items = hubs.flatMap((hub) => hub.Metadata ?? []);

  const normalized = searchQuery.toLowerCase().trim();
  return items.some((item) => {
    const itemTitle = (item.title ?? '').toLowerCase().trim();
    if (!itemTitle) return false;
    return itemTitle === normalized || itemTitle.includes(normalized) || normalized.includes(itemTitle);
  });
}
