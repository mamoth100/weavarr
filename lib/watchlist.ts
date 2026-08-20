export interface WatchlistItem {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_date: string;
  original_language?: string;
  addedAt: number;
}

export function watchedKey(id: number, mediaType: string): string {
  return `${id}:${mediaType}`;
}
