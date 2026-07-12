'use client';

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import {
  type WatchlistItem,
  loadFavorites,
  saveFavorites,
  loadWatched,
  saveWatched,
  watchedKey,
} from '@/lib/watchlist';

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
