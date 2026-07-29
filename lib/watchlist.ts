export interface WatchlistItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_date: string;
  original_language?: string;
  addedAt: number;
}

const FAV_KEY = 'weavarr_favorites';
const WATCHED_KEY = 'weavarr_watched';
const OLD_FAV_KEY = 'docuview_favorites';
const OLD_WATCHED_KEY = 'docuview_watched';

function migrateKey(oldKey: string, newKey: string): void {
  if (localStorage.getItem(newKey) !== null) return;
  const old = localStorage.getItem(oldKey);
  if (old !== null) {
    localStorage.setItem(newKey, old);
    localStorage.removeItem(oldKey);
  }
}

export function watchedKey(id: number, mediaType: string): string {
  return `${id}:${mediaType}`;
}

export function loadFavorites(): WatchlistItem[] {
  try {
    migrateKey(OLD_FAV_KEY, FAV_KEY);
    const raw = localStorage.getItem(FAV_KEY);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch {
    return [];
  }
}

export function saveFavorites(items: WatchlistItem[]): void {
  localStorage.setItem(FAV_KEY, JSON.stringify(items));
}

export function loadWatched(): WatchlistItem[] {
  try {
    migrateKey(OLD_WATCHED_KEY, WATCHED_KEY);
    const raw = localStorage.getItem(WATCHED_KEY);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch {
    return [];
  }
}

export function saveWatched(items: WatchlistItem[]): void {
  localStorage.setItem(WATCHED_KEY, JSON.stringify(items));
}
