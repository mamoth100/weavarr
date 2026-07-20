const PLEX_URL = process.env.PLEX_URL;
const PLEX_TOKEN = process.env.PLEX_TOKEN;

/** True if a title matching (or containing) the given name exists anywhere in the Plex library. */
export async function plexHasTitle(title: string): Promise<boolean> {
  if (!PLEX_URL || !PLEX_TOKEN) throw new Error('Plex is not configured');

  const res = await fetch(`${PLEX_URL}/search?query=${encodeURIComponent(title)}&X-Plex-Token=${PLEX_TOKEN}`, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Plex search failed: ${res.status}`);
  const data = await res.json();
  const items: { title?: string }[] = data.MediaContainer?.Metadata ?? [];

  const normalized = title.toLowerCase().trim();
  return items.some((item) => {
    const itemTitle = (item.title ?? '').toLowerCase().trim();
    return itemTitle === normalized || itemTitle.includes(normalized) || normalized.includes(itemTitle);
  });
}
