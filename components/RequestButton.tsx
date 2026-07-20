'use client';

import { useState } from 'react';
import { useWatchlist } from '@/hooks/useWatchlist';
import type { WatchlistItem } from '@/lib/watchlist';

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_date: string;
  imdbId?: string | null;
}

type Status = 'idle' | 'loading' | 'added' | 'already' | 'error';

const SONARR_MONITOR_OPTIONS = [
  { value: 'all', label: 'All Seasons' },
  { value: 'future', label: 'Future Only' },
  { value: 'firstSeason', label: 'First Season' },
  { value: 'pilot', label: 'Pilot Only' },
] as const;

export default function RequestButton({ id, mediaType, title, poster_path, release_date, imdbId }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [monitor, setMonitor] = useState<string>('all');
  const { addFavorite } = useWatchlist();

  const locked = status === 'loading' || status === 'added' || status === 'already';

  async function handleClick() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch(mediaType === 'movie' ? '/api/radarr/add' : '/api/sonarr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mediaType === 'movie' ? { tmdbId: id } : { imdbId, title, monitor }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setStatus(data.alreadyAdded ? 'already' : 'added');
      const item: WatchlistItem = { id, mediaType, title, poster_path, release_date, addedAt: Date.now() };
      addFavorite(item);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const label =
    status === 'loading' ? 'Requesting…' :
    status === 'added' ? 'Requested ✓' :
    status === 'already' ? 'Already in ' + (mediaType === 'movie' ? 'Radarr' : 'Sonarr') :
    status === 'error' ? 'Failed — retry' :
    mediaType === 'movie' ? 'Request (Radarr)' : 'Request (Sonarr)';

  return (
    <div className="inline-flex flex-col">
      <div className="flex items-center gap-2">
        {mediaType === 'tv' && (
          <select
            value={monitor}
            onChange={(e) => setMonitor(e.target.value)}
            disabled={locked}
            aria-label="Which seasons to download"
            className="px-2 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 disabled:opacity-60"
          >
            {SONARR_MONITOR_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        )}
        <button
          onClick={handleClick}
          disabled={locked}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${
              status === 'added' || status === 'already'
                ? 'bg-green-600 text-white'
                : status === 'error'
                ? 'bg-red-600 text-white hover:bg-red-500'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          aria-label={`Request "${title}" download`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {label}
        </button>
      </div>
      {error && <p className="text-xs text-red-400 mt-1 max-w-xs">{error}</p>}
    </div>
  );
}
