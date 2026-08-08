'use client';

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import { watchedKey, type WatchlistItem } from '@/lib/watchlist';

interface WatchlistContextValue {
  loaded: boolean;
  favorites: WatchlistItem[];
  addFavorite: (item: WatchlistItem) => void;
  removeFavorite: (id: number, mediaType: string) => void;
  isFavorite: (id: number, mediaType: string) => boolean;
  watchedItems: WatchlistItem[];
  toggleWatched: (item: WatchlistItem) => void;
  isWatched: (id: number, mediaType: string) => boolean;
  sucksItems: WatchlistItem[];
  addSucks: (item: WatchlistItem) => void;
  removeSucks: (id: number, mediaType: string) => void;
  isSucks: (id: number, mediaType: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

type Table = 'favorites' | 'watched' | 'sucks';

function apiList(table: Table): Promise<Record<string, unknown>[]> {
  return fetch(`/api/${table}`)
    .then((res) => res.json())
    .then((data) => data.rows ?? []);
}

function apiUpsert(table: Table, row: object): Promise<void> {
  return fetch(`/api/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  }).then(() => undefined);
}

function apiDelete(table: Table, id: number, mediaType: string): Promise<void> {
  return fetch(`/api/${table}?tmdb_id=${id}&media_type=${mediaType}`, { method: 'DELETE' }).then(() => undefined);
}

function rowToItem(row: Record<string, unknown>): WatchlistItem {
  return {
    id: row.tmdb_id as number,
    mediaType: row.media_type as 'movie' | 'tv',
    title: row.title as string,
    poster_path: (row.poster_path as string | null) ?? null,
    release_date: (row.release_date as string) ?? '',
    original_language: (row.original_language as string | undefined) ?? undefined,
    addedAt: new Date(((row.added_at ?? row.watched_at) as string)).getTime(),
  };
}

function toRow(item: WatchlistItem) {
  return {
    tmdb_id: item.id,
    media_type: item.mediaType,
    title: item.title,
    poster_path: item.poster_path,
    release_date: item.release_date,
  };
}

function toFavoritesRow(item: WatchlistItem) {
  return {
    ...toRow(item),
    original_language: item.original_language ?? null,
  };
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [loaded, setLoaded] = useState(false);
  const loadCount = useRef(0);
  const [favorites, setFavorites] = useState<WatchlistItem[]>([]);
  const [watchedItems, setWatchedItems] = useState<WatchlistItem[]>([]);
  const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set());
  const [sucksItems, setSucksItems] = useState<WatchlistItem[]>([]);
  const [sucksSet, setSucksSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    const done = () => { loadCount.current += 1; if (loadCount.current >= 3) setLoaded(true); };
    apiList('favorites').then((rows) => {
      setFavorites(rows.map(rowToItem));
      done();
    });
    apiList('watched').then((rows) => {
      const items = rows.map(rowToItem);
      setWatchedItems(items);
      setWatchedSet(new Set(items.map((i) => watchedKey(i.id, i.mediaType))));
      done();
    });
    apiList('sucks').then((rows) => {
      const items = rows.map(rowToItem);
      setSucksItems(items);
      setSucksSet(new Set(items.map((i) => watchedKey(i.id, i.mediaType))));
      done();
    });
  }, []);

  const addFavorite = useCallback((item: WatchlistItem) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.id === item.id && f.mediaType === item.mediaType)) return prev;
      return [...prev, item];
    });
    apiUpsert('favorites', toFavoritesRow(item));
  }, []);

  const removeFavorite = useCallback((id: number, mediaType: string) => {
    setFavorites((prev) => prev.filter((f) => !(f.id === id && f.mediaType === mediaType)));
    apiDelete('favorites', id, mediaType);
  }, []);

  const isFavorite = useCallback(
    (id: number, mediaType: string) =>
      favorites.some((f) => f.id === id && f.mediaType === mediaType),
    [favorites]
  );

  const toggleWatched = useCallback(
    (item: WatchlistItem) => {
      const key = watchedKey(item.id, item.mediaType);
      if (watchedSet.has(key)) {
        setWatchedItems((prev) => {
          const next = prev.filter((w) => !(w.id === item.id && w.mediaType === item.mediaType));
          try { localStorage.setItem('dv_watched_keys', JSON.stringify(next.map((i) => watchedKey(i.id, i.mediaType)))); } catch {}
          return next;
        });
        setWatchedSet((prev) => { const next = new Set(Array.from(prev)); next.delete(key); return next; });
        apiDelete('watched', item.id, item.mediaType);
      } else {
        setWatchedItems((prev) => {
          const next = [...prev, item];
          try { localStorage.setItem('dv_watched_keys', JSON.stringify(next.map((i) => watchedKey(i.id, i.mediaType)))); } catch {}
          return next;
        });
        setWatchedSet((prev) => new Set(Array.from(prev).concat([key])));
        apiUpsert('watched', toRow(item));
        // Remove from favorites when marked watched
        setFavorites((prev) => prev.filter((f) => !(f.id === item.id && f.mediaType === item.mediaType)));
        apiDelete('favorites', item.id, item.mediaType);
      }
    },
    [watchedSet]
  );

  const isWatched = useCallback(
    (id: number, mediaType: string) => watchedSet.has(watchedKey(id, mediaType)),
    [watchedSet]
  );

  const addSucks = useCallback((item: WatchlistItem) => {
    setSucksItems((prev) => {
      if (prev.some((s) => s.id === item.id && s.mediaType === item.mediaType)) return prev;
      return [...prev, item];
    });
    setSucksSet((prev) => new Set(Array.from(prev).concat([watchedKey(item.id, item.mediaType)])));
    apiUpsert('sucks', toRow(item));
    // Remove from favorites and watched
    setFavorites((prev) => prev.filter((f) => !(f.id === item.id && f.mediaType === item.mediaType)));
    apiDelete('favorites', item.id, item.mediaType);
    setWatchedItems((prev) => prev.filter((w) => !(w.id === item.id && w.mediaType === item.mediaType)));
    setWatchedSet((prev) => { const next = new Set(Array.from(prev)); next.delete(watchedKey(item.id, item.mediaType)); return next; });
    apiDelete('watched', item.id, item.mediaType);
  }, []);

  const removeSucks = useCallback((id: number, mediaType: string) => {
    setSucksItems((prev) => prev.filter((s) => !(s.id === id && s.mediaType === mediaType)));
    setSucksSet((prev) => {
      const next = new Set(Array.from(prev));
      next.delete(watchedKey(id, mediaType));
      return next;
    });
    apiDelete('sucks', id, mediaType);
  }, []);

  const isSucks = useCallback(
    (id: number, mediaType: string) => sucksSet.has(watchedKey(id, mediaType)),
    [sucksSet]
  );

  return (
    <WatchlistContext.Provider
      value={{ loaded, favorites, addFavorite, removeFavorite, isFavorite, watchedItems, toggleWatched, isWatched, sucksItems, addSucks, removeSucks, isSucks }}
    >
      {children}
    </WatchlistContext.Provider>
  );
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext);
  if (!ctx) throw new Error('useWatchlist must be used inside WatchlistProvider');
  return ctx;
}
