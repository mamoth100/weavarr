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
  toggleWatched: (id: number, mediaType: string) => void;
  isWatched: (id: number, mediaType: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextValue | null>(null);

export function WatchlistProvider({ children }: { children: ReactNode }) {
  const [favorites, setFavorites] = useState<WatchlistItem[]>([]);
  const [watched, setWatched] = useState<Set<string>>(new Set());

  useEffect(() => {
    setFavorites(loadFavorites());
    setWatched(loadWatched());
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

  const toggleWatched = useCallback((id: number, mediaType: string) => {
    const key = watchedKey(id, mediaType);
    setWatched((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      saveWatched(next);
      return next;
    });
  }, []);

  const isWatched = useCallback(
    (id: number, mediaType: string) =>
      watched.has(watchedKey(id, mediaType)),
    [watched]
  );

  return (
    <WatchlistContext.Provider
      value={{
        favorites,
        addFavorite,
        removeFavorite,
        isFavorite,
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
