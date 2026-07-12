export interface WatchlistItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_date: string;
  addedAt: number;
}

const FAV_KEY = 'docuview_favorites';
const WATCHED_KEY = 'docuview_watched';

export function watchedKey(id: number, mediaType: string): string {
  return `${id}:${mediaType}`;
}

export function loadFavorites(): WatchlistItem[] {
  try {
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
    const raw = localStorage.getItem(WATCHED_KEY);
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : [];
  } catch {
    return [];
  }
}

export function saveWatched(items: WatchlistItem[]): void {
  localStorage.setItem(WATCHED_KEY, JSON.stringify(items));
}
