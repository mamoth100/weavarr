'use client';

/**
 * The one "watched, still on disk, safe to clean up" feature, shown in two
 * places by design (user decision, UX review 2026-08-14): the Watch page and
 * the Status page render this identical component so it reads as one feature
 * that appears twice, not two different features - it previously had a
 * different name ("Ready to Clean Up") and different buttons on Status.
 */
import { useEffect, useState } from 'react';
import ConfirmButton from '@/components/ConfirmButton';

export interface RecentlyWatchedMovie {
  type: 'movie';
  key: string;
  id: number;
  title: string;
  year: number;
  watchedAt: string;
  reason: string;
  sizeOnDisk: number;
  posterPath: string | null;
}

export interface RecentlyWatchedEpisode {
  type: 'tv';
  key: string;
  seriesId: number;
  title: string;
  seasonNumber: number;
  episodeNumber: number;
  watchedAt: string;
  reason: string;
  posterPath: string | null;
}

export type RecentlyWatchedItem = RecentlyWatchedMovie | RecentlyWatchedEpisode;

export function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '-';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function formatEpisode(e: { seasonNumber: number; episodeNumber: number }): string {
  return `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`;
}

/** service picks which proxy (Radarr vs Sonarr posters live on separate services, both LAN-only - see RadarrLibraryPanel/SonarrLibraryPanel for why this can't just be a direct <img src>). */
export function Poster({
  id,
  hasPoster,
  title,
  service,
}: {
  id: number;
  hasPoster: boolean;
  title: string;
  service: 'radarr' | 'sonarr';
}) {
  const [failed, setFailed] = useState(false);
  if (!hasPoster || failed) {
    return <div className="w-9 h-[54px] rounded bg-zinc-800 flex-shrink-0" />;
  }
  return (
    <img
      src={`/api/${service}/image?id=${id}`}
      alt={title}
      loading="lazy"
      onError={() => setFailed(true)}
      className="w-9 h-[54px] rounded object-cover flex-shrink-0"
    />
  );
}

function RecentlyWatchedDeleteButton({ item, onDeleted }: { item: RecentlyWatchedItem; onDeleted: () => void }) {
  return (
    <ConfirmButton
      label="Delete"
      confirmLabel="Really delete?"
      busyLabel="Deleting…"
      onSuccess={onDeleted}
      action={async () => {
        const url = item.type === 'movie' ? '/api/radarr/delete' : '/api/sonarr/delete-episode';
        const body = item.type === 'movie'
          ? { movieId: item.id }
          : { seriesId: item.seriesId, seasonNumber: item.seasonNumber, episodeNumber: item.episodeNumber };
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      }}
    />
  );
}

function ClearButton({ itemKey, onCleared }: { itemKey: string; onCleared: () => void }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/recently-watched/dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: itemKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onCleared();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={status === 'loading'}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-60 ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
        }`}
      >
        {status === 'loading' ? 'Clearing…' : status === 'error' ? 'Failed - retry' : 'Clear'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

export default function RecentlyWatchedSection({ onCountChange }: { onCountChange?: (count: number) => void }) {
  const [items, setItems] = useState<RecentlyWatchedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/recently-watched', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setItems(data.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  useEffect(() => {
    onCountChange?.(items?.length ?? 0);
  }, [items, onCountChange]);

  if (error || (items && items.length === 0)) return null;

  return (
    <div id="section-recently-watched" className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
        Recently Watched{items && items.length > 0 ? ` (${items.length})` : ''}
      </h2>
      <div className="space-y-2">
        {!items
          ? [1, 2, 3].map((i) => <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />)
          : items.map((item) => {
              return (
                <div key={item.key} className="flex items-start gap-3 bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
                  <Poster
                    id={item.type === 'movie' ? item.id : item.seriesId}
                    hasPoster={Boolean(item.posterPath)}
                    title={item.title}
                    service={item.type === 'movie' ? 'radarr' : 'sonarr'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">
                        {item.title}
                        {item.type === 'movie' ? (item.year ? ` (${item.year})` : '') : ` ${formatEpisode(item)}`}
                      </p>
                      <span className="text-xs font-medium text-amber-400 whitespace-nowrap">{item.reason}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-1">
                      <p className="text-xs text-zinc-500">
                        Watched {timeAgo(item.watchedAt)}
                        {item.type === 'movie' && ` · ${formatBytes(item.sizeOnDisk)}`}
                      </p>
                      <div className="flex items-center gap-2">
                        <ClearButton
                          itemKey={item.key}
                          onCleared={() => setItems((prev) => (prev ?? []).filter((i) => i.key !== item.key))}
                        />
                        <RecentlyWatchedDeleteButton
                          item={item}
                          onDeleted={() => setItems((prev) => (prev ?? []).filter((i) => i.key !== item.key))}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
      </div>
    </div>
  );
}
