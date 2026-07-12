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
import { supabase } from '@/lib/supabase';
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
    supabase.from('favorites').select('*').then(({ data }) => {
      if (data) setFavorites(data.map(rowToItem));
      done();
    });
    supabase.from('watched').select('*').then(({ data }) => {
      if (data) {
        const items = data.map(rowToItem);
        setWatchedItems(items);
        setWatchedSet(new Set(items.map((i) => watchedKey(i.id, i.mediaType))));
      }
      done();
    });
    supabase.from('sucks').select('*').then(({ data }) => {
      if (data) {
        const items = data.map(rowToItem);
        setSucksItems(items);
        setSucksSet(new Set(items.map((i) => watchedKey(i.id, i.mediaType))));
      }
      done();
    });
  }, []);

  const addFavorite = useCallback((item: WatchlistItem) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.id === item.id && f.mediaType === item.mediaType)) return prev;
      return [...prev, item];
    });
    supabase.from('favorites').upsert(toRow(item), { onConflict: 'tmdb_id,media_type' }).then();
  }, []);

  const removeFavorite = useCallback((id: number, mediaType: string) => {
    setFavorites((prev) => prev.filter((f) => !(f.id === id && f.mediaType === mediaType)));
    supabase.from('favorites').delete().eq('tmdb_id', id).eq('media_type', mediaType).then();
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
        supabase.from('watched').delete().eq('tmdb_id', item.id).eq('media_type', item.mediaType).then();
      } else {
        setWatchedItems((prev) => {
          const next = [...prev, item];
          try { localStorage.setItem('dv_watched_keys', JSON.stringify(next.map((i) => watchedKey(i.id, i.mediaType)))); } catch {}
          return next;
        });
        setWatchedSet((prev) => new Set(Array.from(prev).concat([key])));
        supabase.from('watched').upsert(
          { ...toRow(item), watched_at: new Date().toISOString() },
          { onConflict: 'tmdb_id,media_type' }
        ).then();
        // Remove from favorites when marked watched
        setFavorites((prev) => prev.filter((f) => !(f.id === item.id && f.mediaType === item.mediaType)));
        supabase.from('favorites').delete().eq('tmdb_id', item.id).eq('media_type', item.mediaType).then();
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
    supabase.from('sucks').upsert(toRow(item), { onConflict: 'tmdb_id,media_type' }).then();
    // Remove from favorites and watched
    setFavorites((prev) => prev.filter((f) => !(f.id === item.id && f.mediaType === item.mediaType)));
    supabase.from('favorites').delete().eq('tmdb_id', item.id).eq('media_type', item.mediaType).then();
    setWatchedItems((prev) => prev.filter((w) => !(w.id === item.id && w.mediaType === item.mediaType)));
    setWatchedSet((prev) => { const next = new Set(Array.from(prev)); next.delete(watchedKey(item.id, item.mediaType)); return next; });
    supabase.from('watched').delete().eq('tmdb_id', item.id).eq('media_type', item.mediaType).then();
  }, []);

  const removeSucks = useCallback((id: number, mediaType: string) => {
    setSucksItems((prev) => prev.filter((s) => !(s.id === id && s.mediaType === mediaType)));
    setSucksSet((prev) => {
      const next = new Set(Array.from(prev));
      next.delete(watchedKey(id, mediaType));
      return next;
    });
    supabase.from('sucks').delete().eq('tmdb_id', id).eq('media_type', mediaType).then();
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
