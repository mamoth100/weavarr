'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type { User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { watchedKey, type WatchlistItem } from '@/lib/watchlist';

interface WatchlistContextValue {
  user: User | null;
  favorites: WatchlistItem[];
  addFavorite: (item: WatchlistItem) => void;
  removeFavorite: (id: number, mediaType: string) => void;
  isFavorite: (id: number, mediaType: string) => boolean;
  watchedItems: WatchlistItem[];
  toggleWatched: (item: WatchlistItem) => void;
  isWatched: (id: number, mediaType: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

// Map a DB row → WatchlistItem
function rowToItem(row: Record<string, unknown>): WatchlistItem {
  return {
    id: row.tmdb_id as number,
    mediaType: row.media_type as 'movie' | 'tv',
    title: row.title as string,
    poster_path: (row.poster_path as string | null) ?? null,
    release_date: (row.release_date as string) ?? '',
    addedAt: new Date((row.added_at ?? row.watched_at) as string).getTime(),
  };
}

// Map a WatchlistItem + userId → DB row
function toRow(item: WatchlistItem, userId: string) {
  return {
    user_id: userId,
    tmdb_id: item.id,
    media_type: item.mediaType,
    title: item.title,
    poster_path: item.poster_path,
    release_date: item.release_date,
  };
}

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [favorites, setFavorites] = useState<WatchlistItem[]>([]);
  const [watchedItems, setWatchedItems] = useState<WatchlistItem[]>([]);
  const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set());

  async function loadData(userId: string) {
    const [favsRes, watchedRes] = await Promise.all([
      supabase.from('favorites').select('*').eq('user_id', userId),
      supabase.from('watched').select('*').eq('user_id', userId),
    ]);
    if (favsRes.data) setFavorites(favsRes.data.map(rowToItem));
    if (watchedRes.data) {
      const items = watchedRes.data.map(rowToItem);
      setWatchedItems(items);
      setWatchedSet(new Set(items.map((i) => watchedKey(i.id, i.mediaType))));
    }
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) loadData(session.user.id);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setUser(session?.user ?? null);
        if (session?.user) {
          loadData(session.user.id);
        } else {
          setFavorites([]);
          setWatchedItems([]);
          setWatchedSet(new Set());
        }
      }
    );

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFavorite = useCallback(
    (item: WatchlistItem) => {
      if (!user) return;
      setFavorites((prev) => {
        if (prev.some((f) => f.id === item.id && f.mediaType === item.mediaType))
          return prev;
        return [...prev, item];
      });
      supabase
        .from('favorites')
        .upsert(toRow(item, user.id), { onConflict: 'user_id,tmdb_id,media_type' })
        .then(({ error }) => { if (error) loadData(user.id); });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user]
  );

  const removeFavorite = useCallback(
    (id: number, mediaType: string) => {
      if (!user) return;
      setFavorites((prev) =>
        prev.filter((f) => !(f.id === id && f.mediaType === mediaType))
      );
      supabase
        .from('favorites')
        .delete()
        .eq('user_id', user.id)
        .eq('tmdb_id', id)
        .eq('media_type', mediaType)
        .then(({ error }) => { if (error) loadData(user.id); });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user]
  );

  const isFavorite = useCallback(
    (id: number, mediaType: string) =>
      favorites.some((f) => f.id === id && f.mediaType === mediaType),
    [favorites]
  );

  const toggleWatched = useCallback(
    (item: WatchlistItem) => {
      if (!user) return;
      const key = watchedKey(item.id, item.mediaType);
      const alreadyWatched = watchedSet.has(key);

      if (alreadyWatched) {
        setWatchedItems((prev) =>
          prev.filter((w) => !(w.id === item.id && w.mediaType === item.mediaType))
        );
        setWatchedSet((prev) => {
          const next = new Set(Array.from(prev));
          next.delete(key);
          return next;
        });
        supabase
          .from('watched')
          .delete()
          .eq('user_id', user.id)
          .eq('tmdb_id', item.id)
          .eq('media_type', item.mediaType)
          .then(({ error }) => { if (error) loadData(user.id); });
      } else {
        setWatchedItems((prev) => [...prev, item]);
        setWatchedSet((prev) => new Set(Array.from(prev).concat([key])));
        supabase
          .from('watched')
          .upsert(
            { ...toRow(item, user.id), watched_at: new Date().toISOString() },
            { onConflict: 'user_id,tmdb_id,media_type' }
          )
          .then(({ error }) => { if (error) loadData(user.id); });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user, watchedSet]
  );

  const isWatched = useCallback(
    (id: number, mediaType: string) => watchedSet.has(watchedKey(id, mediaType)),
    [watchedSet]
  );

  return (
    <WatchlistContext.Provider
      value={{
        user,
        favorites,
        addFavorite,
        removeFavorite,
        isFavorite,
        watchedItems,
        toggleWatched,
        isWatched,
      }}
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


interface WatchlistContextValue {
  favorites: WatchlistItem[];
  addFavorite: (item: WatchlistItem) => void;
  removeFavorite: (id: number, mediaType: string) => void;
  isFavorite: (id: number, mediaType: string) => boolean;
  watchedItems: WatchlistItem[];
  toggleWatched: (item: WatchlistItem) => void;
  isWatched: (id: number, mediaType: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<WatchlistItem[]>([]);
  const [watchedItems, setWatchedItems] = useState<WatchlistItem[]>([]);
  // Fast lookup set derived from watchedItems
  const [watchedSet, setWatchedSet] = useState<Set<string>>(new Set());

  useEffect(() => {
    const favs = loadFavorites();
    const items = loadWatched();
    setFavorites(favs);
    setWatchedItems(items);
    setWatchedSet(new Set(items.map((i) => watchedKey(i.id, i.mediaType))));
  }, []);

  const addFavorite = useCallback((item: WatchlistItem) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.id === item.id && f.mediaType === item.mediaType))
        return prev;
      const next = [...prev, item];
      saveFavorites(next);
      return next;
    });
  }, []);

  const removeFavorite = useCallback((id: number, mediaType: string) => {
    setFavorites((prev) => {
      const next = prev.filter(
        (f) => !(f.id === id && f.mediaType === mediaType)
      );
      saveFavorites(next);
      return next;
    });
  }, []);

  const isFavorite = useCallback(
    (id: number, mediaType: string) =>
      favorites.some((f) => f.id === id && f.mediaType === mediaType),
    [favorites]
  );

  const toggleWatched = useCallback((item: WatchlistItem) => {
    const key = watchedKey(item.id, item.mediaType);
    setWatchedItems((prev) => {
      const exists = prev.some(
        (w) => w.id === item.id && w.mediaType === item.mediaType
      );
      const next = exists
        ? prev.filter((w) => !(w.id === item.id && w.mediaType === item.mediaType))
        : [...prev, { ...item, addedAt: item.addedAt || Date.now() }];
      saveWatched(next);
      setWatchedSet(new Set(next.map((i) => watchedKey(i.id, i.mediaType))));
      return next;
    });
  }, []);

  const isWatched = useCallback(
    (id: number, mediaType: string) =>
      watchedSet.has(watchedKey(id, mediaType)),
    [watchedSet]
  );

  return (
    <WatchlistContext.Provider
      value={{
        favorites,
        addFavorite,
        removeFavorite,
        isFavorite,
        watchedItems,
        toggleWatched,
        isWatched,
      }}
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
