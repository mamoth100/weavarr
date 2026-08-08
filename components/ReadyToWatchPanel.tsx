'use client';

import { useEffect, useRef, useState } from 'react';
import SimplePagination from '@/components/SimplePagination';

const PAGE_SIZE = 50;

interface ReadyToWatchItem {
  type: 'movie' | 'tv';
  id: number;
  title: string;
  year: number;
  unwatchedEpisodes?: { seasonNumber: number; episodeNumber: number }[];
  sizeOnDisk: number;
  posterPath: string | null;
}

function formatBytes(bytes: number): string {
  if (!bytes) return '-';
  const gb = bytes / (1024 * 1024 * 1024);
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

/** service picks which proxy (Radarr vs Sonarr posters live on separate services, both LAN-only - see RadarrLibraryPanel/SonarrLibraryPanel for why this can't just be a direct <img src>). */
function Poster({
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

function formatEpisode(e: { seasonNumber: number; episodeNumber: number }): string {
  return `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`;
}

const MAX_EPISODE_TAGS = 6;

function EpisodeList({ episodes }: { episodes: { seasonNumber: number; episodeNumber: number }[] }) {
  const shown = episodes.slice(0, MAX_EPISODE_TAGS);
  const remaining = episodes.length - shown.length;
  return (
    <span>
      {shown.map(formatEpisode).join(', ')}
      {remaining > 0 && ` +${remaining} more`}
    </span>
  );
}

function MovieDeleteButton({ item, onDeleted }: { item: ReadyToWatchItem; onDeleted: () => void }) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/radarr/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movieId: item.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setStatus('done');
      onDeleted();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === 'done') {
    return <span className="text-xs font-medium text-green-400">Deleted</span>;
  }

  if (status === 'confirm' || status === 'loading') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">Delete this movie?</span>
        <button
          onClick={handleConfirm}
          disabled={status === 'loading'}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-60"
        >
          {status === 'loading' ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setStatus('idle')}
          disabled={status === 'loading'}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setStatus('confirm')}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-red-600 hover:text-white'
        }`}
      >
        {status === 'error' ? 'Failed - retry' : 'Delete'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function ShowDeleteDropdown({
  item,
  onEpisodeDeleted,
}: {
  item: ReadyToWatchItem;
  onEpisodeDeleted: (seasonNumber: number, episodeNumber: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<{ seasonNumber: number; episodeNumber: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(null);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  async function confirmDelete(seasonNumber: number, episodeNumber: number) {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/sonarr/delete-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId: item.id, seasonNumber, episodeNumber }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setStatus('idle');
      setOpen(false);
      setConfirming(null);
      onEpisodeDeleted(seasonNumber, episodeNumber);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={status === 'loading'}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-60 ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-red-600 hover:text-white'
        }`}
      >
        {status === 'loading' ? 'Deleting…' : status === 'error' ? 'Failed - retry' : 'Delete ▾'}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 min-w-[160px] max-h-56 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg">
          {(item.unwatchedEpisodes ?? []).map((e) => {
            const isConfirming = confirming?.seasonNumber === e.seasonNumber && confirming?.episodeNumber === e.episodeNumber;
            if (isConfirming) {
              return (
                <div key={`${e.seasonNumber}-${e.episodeNumber}`} className="px-3 py-1.5 flex items-center gap-2 bg-zinc-900">
                  <span className="text-xs text-zinc-400">{formatEpisode(e)}?</span>
                  <button
                    onClick={() => confirmDelete(e.seasonNumber, e.episodeNumber)}
                    disabled={status === 'loading'}
                    className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-60"
                  >
                    Yes
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    disabled={status === 'loading'}
                    className="text-xs font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
                  >
                    No
                  </button>
                </div>
              );
            }
            return (
              <button
                key={`${e.seasonNumber}-${e.episodeNumber}`}
                onClick={() => setConfirming({ seasonNumber: e.seasonNumber, episodeNumber: e.episodeNumber })}
                className="block w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white"
              >
                {formatEpisode(e)}
              </button>
            );
          })}
        </div>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

async function callMarkWatched(body: object): Promise<void> {
  const res = await fetch('/api/plex/mark-watched', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? 'Failed');
}

function MovieWatchedButton({
  item,
  onWatched,
  disabled,
}: {
  item: ReadyToWatchItem;
  onWatched: () => void;
  /** True once the file's been deleted - Plex drops the item from its own index almost immediately, so marking watched can no longer succeed. */
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus('loading');
    setError(null);
    try {
      await callMarkWatched({ type: 'movie', title: item.title });
      onWatched();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={disabled || status === 'loading'}
        title={disabled ? "File already deleted - Plex no longer has this to mark watched" : undefined}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-60 ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-green-600 hover:text-white'
        }`}
      >
        {status === 'loading' ? 'Marking…' : status === 'error' ? 'Failed - retry' : 'Watched'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function ShowWatchedDropdown({
  item,
  onEpisodeWatched,
}: {
  item: ReadyToWatchItem;
  onEpisodeWatched: (seasonNumber: number, episodeNumber: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [open]);

  async function markEpisode(seasonNumber: number, episodeNumber: number) {
    setStatus('loading');
    setError(null);
    try {
      await callMarkWatched({ type: 'tv', title: item.title, episodes: [{ seasonNumber, episodeNumber }] });
      setStatus('idle');
      setOpen(false);
      onEpisodeWatched(seasonNumber, episodeNumber);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={status === 'loading'}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-60 ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-green-600 hover:text-white'
        }`}
      >
        {status === 'loading' ? 'Marking…' : status === 'error' ? 'Failed - retry' : 'Watched ▾'}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 min-w-[110px] max-h-56 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg">
          {(item.unwatchedEpisodes ?? []).map((e) => (
            <button
              key={`${e.seasonNumber}-${e.episodeNumber}`}
              onClick={() => markEpisode(e.seasonNumber, e.episodeNumber)}
              className="block w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white"
            >
              {formatEpisode(e)}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

interface RecentlyWatchedMovie {
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

interface RecentlyWatchedEpisode {
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

type RecentlyWatchedItem = RecentlyWatchedMovie | RecentlyWatchedEpisode;

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function RecentlyWatchedDeleteButton({ item, onDeleted }: { item: RecentlyWatchedItem; onDeleted: () => void }) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus('loading');
    setError(null);
    try {
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
      setStatus('done');
      onDeleted();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === 'done') {
    return <span className="text-xs font-medium text-green-400">Deleted</span>;
  }

  if (status === 'confirm' || status === 'loading') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">Delete{item.type === 'movie' ? ' this movie' : ''}?</span>
        <button
          onClick={handleConfirm}
          disabled={status === 'loading'}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-60"
        >
          {status === 'loading' ? 'Deleting…' : 'Yes, delete'}
        </button>
        <button
          onClick={() => setStatus('idle')}
          disabled={status === 'loading'}
          className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setStatus('confirm')}
        className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-red-600 hover:text-white'
        }`}
      >
        {status === 'error' ? 'Failed - retry' : 'Delete'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
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

interface MissingAiredEpisode {
  episodeId: number;
  seriesId: number;
  seriesTitle: string;
  hasPoster: boolean;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDateUtc: string;
}

function formatAirDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function SearchMissingButton({
  episode,
  searching,
  onSearchStarted,
}: {
  episode: MissingAiredEpisode;
  /** True once a search has actually been confirmed triggered - persists across polls until the episode is confirmed downloaded and drops out of the missing list entirely, rather than reverting after one fetch cycle. */
  searching: boolean;
  onSearchStarted: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function handleClick() {
    setStatus('loading');
    try {
      const res = await fetch('/api/sonarr/search-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId: episode.episodeId, seriesId: episode.seriesId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      onSearchStarted();
    } catch {
      setStatus('error');
    }
  }

  if (searching) {
    return <span className="text-xs font-medium text-amber-400">Searching…</span>;
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-60 ${
        status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-400 hover:bg-amber-500 hover:text-black'
      }`}
    >
      {status === 'loading' ? 'Searching…' : status === 'error' ? 'Failed - retry' : 'Search'}
    </button>
  );
}

/** "Give up" on a missing episode - unmonitors it so Sonarr stops trying, since there's no file to delete in the first place. */
function GiveUpEpisodeButton({ episodeId, onGivenUp }: { episodeId: number; onGivenUp: () => void }) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/sonarr/give-up-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onGivenUp();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === 'confirm' || status === 'loading') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-500">Give up?</span>
        <button
          onClick={handleConfirm}
          disabled={status === 'loading'}
          className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-60"
        >
          {status === 'loading' ? '…' : 'Yes'}
        </button>
        <button
          onClick={() => setStatus('idle')}
          disabled={status === 'loading'}
          className="text-xs font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setStatus('confirm')}
        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-500 hover:bg-red-600 hover:text-white'
        }`}
      >
        {status === 'error' ? 'Failed - retry' : 'Give up'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

interface MissingShowGroup {
  seriesId: number;
  seriesTitle: string;
  hasPoster: boolean;
  episodes: MissingAiredEpisode[];
}

const MISSING_POLL_INTERVAL_MS = 30000;

/**
 * Episodes that have already aired but Sonarr still has no file for - a gap
 * it should have grabbed, not just something not out yet. A row only leaves
 * this section once Sonarr's own missing list confirms the file landed
 * (polled while anything here is mid-search) - clicking Search doesn't
 * remove it on its own, since triggering a search is not the same as the
 * episode actually being downloaded.
 */
function MissingAiredSection({ onEpisodeAvailable }: { onEpisodeAvailable: () => void }) {
  const [episodes, setEpisodes] = useState<MissingAiredEpisode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [searchingIds, setSearchingIds] = useState<Set<number>>(new Set());

  function fetchMissing() {
    return fetch('/api/sonarr/missing', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const next: MissingAiredEpisode[] = data.episodes;
        const nextIds = new Set(next.map((e) => e.episodeId));

        setSearchingIds((prev) => {
          const stillMissing = new Set(Array.from(prev).filter((id) => nextIds.has(id)));
          if (stillMissing.size !== prev.size) onEpisodeAvailable(); // something we were tracking dropped off the missing list - it landed
          return stillMissing;
        });
        setEpisodes(next);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    fetchMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only keep polling while something here is actually being searched for -
  // no point re-checking Sonarr on a timer when nothing's in flight.
  useEffect(() => {
    if (searchingIds.size === 0) return;
    const interval = setInterval(fetchMissing, MISSING_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchingIds.size]);

  function markSearching(episodeId: number) {
    setSearchingIds((prev) => new Set(prev).add(episodeId));
  }

  function handleGivenUp(episodeId: number) {
    setEpisodes((prev) => (prev ? prev.filter((e) => e.episodeId !== episodeId) : prev));
    setSearchingIds((prev) => {
      if (!prev.has(episodeId)) return prev;
      const next = new Set(prev);
      next.delete(episodeId);
      return next;
    });
  }

  if (error || (episodes && episodes.length === 0)) return null;

  const groups: MissingShowGroup[] = [];
  if (episodes) {
    const bySeriesId = new Map<number, MissingShowGroup>();
    for (const e of episodes) {
      let g = bySeriesId.get(e.seriesId);
      if (!g) {
        g = { seriesId: e.seriesId, seriesTitle: e.seriesTitle, hasPoster: e.hasPoster, episodes: [] };
        bySeriesId.set(e.seriesId, g);
      }
      g.episodes.push(e);
    }
    groups.push(...Array.from(bySeriesId.values()).sort((a, b) => a.seriesTitle.localeCompare(b.seriesTitle)));
  }

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
        Aired, Not Downloaded{episodes && episodes.length > 0 ? ` (${episodes.length})` : ''}
      </h2>
      <div className="space-y-2">
        {!episodes
          ? [1, 2].map((i) => <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />)
          : groups.map((g) => (
              <div key={g.seriesId} className="bg-zinc-900 rounded-lg ring-1 ring-white/5 overflow-hidden">
                <button
                  onClick={() => setExpanded((prev) => (prev === g.seriesId ? null : g.seriesId))}
                  className="w-full flex items-center gap-3 p-3 text-left"
                >
                  <span className={`text-zinc-500 text-xs transition-transform ${expanded === g.seriesId ? 'rotate-90' : ''}`}>▶</span>
                  <Poster id={g.seriesId} hasPoster={g.hasPoster} title={g.seriesTitle} service="sonarr" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{g.seriesTitle}</p>
                    <p className="text-xs text-zinc-500">
                      {g.episodes.length} episode{g.episodes.length === 1 ? '' : 's'} missing
                    </p>
                  </div>
                </button>
                {expanded === g.seriesId && (
                  <div className="px-3 pb-3 space-y-1">
                    {g.episodes.map((e) => (
                      <div key={e.episodeId} className="flex items-center justify-between bg-zinc-800/40 rounded px-2.5 py-1.5">
                        <p className="text-xs text-zinc-300 truncate pr-2">
                          <span className="text-zinc-500">
                            S{String(e.seasonNumber).padStart(2, '0')}E{String(e.episodeNumber).padStart(2, '0')}
                          </span>{' '}
                          {e.title}
                          <span className="text-zinc-600"> · aired {formatAirDate(e.airDateUtc)}</span>
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          <SearchMissingButton
                            episode={e}
                            searching={searchingIds.has(e.episodeId)}
                            onSearchStarted={() => markSearching(e.episodeId)}
                          />
                          <GiveUpEpisodeButton episodeId={e.episodeId} onGivenUp={() => handleGivenUp(e.episodeId)} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
      </div>
    </div>
  );
}

interface MissingMovie {
  movieId: number;
  title: string;
  year: number;
  hasPoster: boolean;
  releaseDate: string | null;
}

function SearchMissingMovieButton({
  movie,
  searching,
  onSearchStarted,
}: {
  movie: MissingMovie;
  searching: boolean;
  onSearchStarted: () => void;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function handleClick() {
    setStatus('loading');
    try {
      const res = await fetch('/api/radarr/search-movie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movieId: movie.movieId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      onSearchStarted();
    } catch {
      setStatus('error');
    }
  }

  if (searching) {
    return <span className="text-xs font-medium text-amber-400">Searching…</span>;
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className={`px-2 py-0.5 rounded text-xs font-medium transition-colors disabled:opacity-60 ${
        status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-400 hover:bg-amber-500 hover:text-black'
      }`}
    >
      {status === 'loading' ? 'Searching…' : status === 'error' ? 'Failed - retry' : 'Search'}
    </button>
  );
}

/** Gives up on a missing movie by removing it from Radarr entirely - unlike a missing episode there's no partial series to preserve, so full removal (same as the regular movie Delete button) is the only sensible "stop asking" action. */
function MissingMovieDeleteButton({ movieId, onDeleted }: { movieId: number; onDeleted: () => void }) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/radarr/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ movieId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      onDeleted();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === 'confirm' || status === 'loading') {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-500">Delete?</span>
        <button
          onClick={handleConfirm}
          disabled={status === 'loading'}
          className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-60"
        >
          {status === 'loading' ? '…' : 'Yes'}
        </button>
        <button
          onClick={() => setStatus('idle')}
          disabled={status === 'loading'}
          className="text-xs font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
        >
          No
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={() => setStatus('confirm')}
        className={`px-2 py-0.5 rounded text-xs font-medium transition-colors ${
          status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-500 hover:bg-red-600 hover:text-white'
        }`}
      >
        {status === 'error' ? 'Failed - retry' : 'Delete'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

/** Movies Radarr has monitored, has no file for, and hasn't found on any indexer - the movie equivalent of MissingAiredSection, added since Radarr has no built-in concept mirroring Sonarr's air-date gap. */
function MissingMoviesSection() {
  const [movies, setMovies] = useState<MissingMovie[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchingIds, setSearchingIds] = useState<Set<number>>(new Set());

  function fetchMissing() {
    return fetch('/api/radarr/missing', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const next: MissingMovie[] = data.movies;
        const nextIds = new Set(next.map((m) => m.movieId));
        setSearchingIds((prev) => new Set(Array.from(prev).filter((id) => nextIds.has(id))));
        setMovies(next);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    fetchMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Only keep polling while something here is actually being searched for.
  useEffect(() => {
    if (searchingIds.size === 0) return;
    const interval = setInterval(fetchMissing, MISSING_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchingIds.size]);

  function markSearching(movieId: number) {
    setSearchingIds((prev) => new Set(prev).add(movieId));
  }

  function handleDeleted(movieId: number) {
    setMovies((prev) => (prev ? prev.filter((m) => m.movieId !== movieId) : prev));
  }

  if (error || (movies && movies.length === 0)) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
        Movies Not Found{movies && movies.length > 0 ? ` (${movies.length})` : ''}
      </h2>
      <div className="space-y-2">
        {!movies
          ? [1, 2].map((i) => <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />)
          : movies.map((m) => (
              <div key={m.movieId} className="flex items-center gap-3 bg-zinc-900 rounded-lg ring-1 ring-white/5 p-3">
                <Poster id={m.movieId} hasPoster={m.hasPoster} title={m.title} service="radarr" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {m.title} <span className="text-zinc-500">({m.year})</span>
                  </p>
                  {m.releaseDate && <p className="text-xs text-zinc-600">released {formatAirDate(m.releaseDate)}</p>}
                </div>
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <SearchMissingMovieButton
                    movie={m}
                    searching={searchingIds.has(m.movieId)}
                    onSearchStarted={() => markSearching(m.movieId)}
                  />
                  <MissingMovieDeleteButton movieId={m.movieId} onDeleted={() => handleDeleted(m.movieId)} />
                </div>
              </div>
            ))}
      </div>
    </div>
  );
}

function RecentlyWatchedSection() {
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

  if (error || (items && items.length === 0)) return null;

  return (
    <div className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Recently Watched</h2>
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

function ReadyToWatchRow({
  item,
  onWatched,
  onEpisodeWatched,
  onEpisodeDeleted,
}: {
  item: ReadyToWatchItem;
  onWatched: () => void;
  onEpisodeWatched: (seasonNumber: number, episodeNumber: number) => void;
  onEpisodeDeleted: (seasonNumber: number, episodeNumber: number) => void;
}) {
  // Movies only - once the file's deleted, Plex drops it from its own index almost
  // immediately, so a later Watched click has nothing left to mark. TV doesn't need
  // this: deleting a specific episode already removes it from both dropdowns at once.
  const [movieDeleted, setMovieDeleted] = useState(false);

  return (
    <div className="flex items-center justify-between bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
      <div className="flex items-center gap-3 min-w-0">
        <Poster id={item.id} hasPoster={Boolean(item.posterPath)} title={item.title} service={item.type === 'movie' ? 'radarr' : 'sonarr'} />
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {item.title}{' '}
            {item.type === 'movie' && item.year
              ? `(${item.year})`
              : item.type === 'tv' && item.unwatchedEpisodes
              ? `(${item.unwatchedEpisodes.length} Episode${item.unwatchedEpisodes.length === 1 ? '' : 's'})`
              : ''}
          </p>
          <p className="text-xs text-zinc-500">
            {item.type === 'tv' && item.unwatchedEpisodes && (
              <>
                <EpisodeList episodes={item.unwatchedEpisodes} /> unwatched ·{' '}
              </>
            )}
            {formatBytes(item.sizeOnDisk)}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {item.type === 'movie' ? (
          <>
            <MovieWatchedButton item={item} onWatched={onWatched} disabled={movieDeleted} />
            <MovieDeleteButton item={item} onDeleted={() => setMovieDeleted(true)} />
          </>
        ) : (
          <>
            <ShowWatchedDropdown item={item} onEpisodeWatched={onEpisodeWatched} />
            <ShowDeleteDropdown item={item} onEpisodeDeleted={onEpisodeDeleted} />
          </>
        )}
      </div>
    </div>
  );
}

export default function ReadyToWatchPanel() {
  const [items, setItems] = useState<ReadyToWatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [tvPage, setTvPage] = useState(1);
  const [moviePage, setMoviePage] = useState(1);

  function refreshItems() {
    return fetch('/api/ready-to-watch', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setItems(data.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    refreshItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (error) {
    return <p className="text-red-400 text-sm">Failed to load: {error}</p>;
  }

  if (!items) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  function removeUnwatchedEpisode(itemId: number, seasonNumber: number, episodeNumber: number) {
    setItems((prev) =>
      (prev ?? [])
        .map((i) => {
          if (i.type !== 'tv' || i.id !== itemId) return i;
          const remaining = (i.unwatchedEpisodes ?? []).filter(
            (e) => !(e.seasonNumber === seasonNumber && e.episodeNumber === episodeNumber)
          );
          return { ...i, unwatchedEpisodes: remaining };
        })
        .filter((i) => i.type !== 'tv' || (i.unwatchedEpisodes && i.unwatchedEpisodes.length > 0))
    );
  }

  const filtered = items.filter((i) => i.title.toLowerCase().includes(query.toLowerCase()));
  const tvItems = filtered.filter((i) => i.type === 'tv');
  const movieItems = filtered.filter((i) => i.type === 'movie');

  const tvTotalPages = Math.max(1, Math.ceil(tvItems.length / PAGE_SIZE));
  const tvPageSafe = Math.min(tvPage, tvTotalPages);
  const tvPaged = tvItems.slice((tvPageSafe - 1) * PAGE_SIZE, tvPageSafe * PAGE_SIZE);

  const movieTotalPages = Math.max(1, Math.ceil(movieItems.length / PAGE_SIZE));
  const moviePageSafe = Math.min(moviePage, movieTotalPages);
  const moviePaged = movieItems.slice((moviePageSafe - 1) * PAGE_SIZE, moviePageSafe * PAGE_SIZE);

  function renderRow(item: ReadyToWatchItem) {
    return (
      <ReadyToWatchRow
        key={`${item.type}-${item.id}`}
        item={item}
        onWatched={() => setItems((prev) => (prev ?? []).filter((i) => !(i.type === item.type && i.id === item.id)))}
        onEpisodeWatched={(seasonNumber, episodeNumber) => removeUnwatchedEpisode(item.id, seasonNumber, episodeNumber)}
        onEpisodeDeleted={(seasonNumber, episodeNumber) => removeUnwatchedEpisode(item.id, seasonNumber, episodeNumber)}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between text-sm text-zinc-500">
        <span>{items.length} to watch</span>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setTvPage(1);
            setMoviePage(1);
          }}
          placeholder="Filter by title…"
          className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
        />
      </div>
      {filtered.length === 0 && (
        <p className="text-zinc-600 text-sm">Nothing unwatched right now - you're all caught up.</p>
      )}
      <MissingAiredSection onEpisodeAvailable={refreshItems} />
      {tvItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            TV Shows{tvItems.length > PAGE_SIZE && ` (${tvItems.length})`}
          </h2>
          <div className="space-y-2">{tvPaged.map(renderRow)}</div>
          <SimplePagination page={tvPageSafe} totalPages={tvTotalPages} onChange={setTvPage} />
        </div>
      )}
      {movieItems.length > 0 && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Movies{movieItems.length > PAGE_SIZE && ` (${movieItems.length})`}
          </h2>
          <div className="space-y-2">{moviePaged.map(renderRow)}</div>
          <SimplePagination page={moviePageSafe} totalPages={movieTotalPages} onChange={setMoviePage} />
        </div>
      )}
      <MissingMoviesSection />
      <RecentlyWatchedSection />
    </div>
  );
}
