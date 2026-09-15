'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useInfiniteReveal } from '@/hooks/useInfiniteReveal';
import { useDismissable } from '@/hooks/useDismissable';
import RecentlyWatchedSection, { Poster, formatBytes, formatEpisode } from '@/components/RecentlyWatchedSection';
import ConfirmButton from '@/components/ConfirmButton';
import { buttonClass } from '@/components/buttonClass';
import LastEpisodeModal, { type DeleteAftermath } from '@/components/LastEpisodeModal';

const PAGE_SIZE = 50;

interface ReadyToWatchItem {
  type: 'movie' | 'tv';
  id: number;
  tmdbId: number | null;
  protected?: boolean;
  title: string;
  year: number;
  unwatchedEpisodes?: { seasonNumber: number; episodeNumber: number; title?: string }[];
  sizeOnDisk: number;
  posterPath: string | null;
}


const MAX_EPISODE_TAGS = 6;

function EpisodeList({ episodes }: { episodes: { seasonNumber: number; episodeNumber: number }[] }) {
  // "+N more" used to be plain text that looked tappable but wasn't - it's a
  // real expand/collapse toggle now.
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? episodes : episodes.slice(0, MAX_EPISODE_TAGS);
  const remaining = episodes.length - MAX_EPISODE_TAGS;
  return (
    <span>
      {shown.map(formatEpisode).join(', ')}
      {remaining > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-1 text-amber-400 hover:text-amber-300 font-medium"
        >
          {expanded ? 'show less' : `+${remaining} more`}
        </button>
      )}
    </span>
  );
}

function MovieDeleteButton({ item, onDeleted }: { item: ReadyToWatchItem; onDeleted: () => void }) {
  return (
    <ConfirmButton
      label="Delete"
      confirmLabel="Really delete?"
      busyLabel="Deleting…"
      onSuccess={onDeleted}
      action={async () => {
        const res = await fetch('/api/radarr/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movieId: item.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      }}
    />
  );
}

function ShowDeleteDropdown({
  item,
  onEpisodeDeleted,
  onAftermath,
}: {
  item: ReadyToWatchItem;
  onEpisodeDeleted: (seasonNumber: number, episodeNumber: number) => void;
  onAftermath: (a: DeleteAftermath) => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState<{ seasonNumber: number; episodeNumber: number } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismissable(open, containerRef, () => {
    setOpen(false);
    setConfirming(null);
  });

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
      if (data.after && data.after.remainingFiles === 0) onAftermath(data.after);
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
        className={buttonClass({ tone: 'danger', error: status === 'error' })}
      >
        {status === 'loading' ? 'Deleting…' : status === 'error' ? 'Failed - retry' : 'Delete episodes ▾'}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 min-w-[160px] max-h-56 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg">
          {(item.unwatchedEpisodes ?? []).map((e) => {
            const isConfirming = confirming?.seasonNumber === e.seasonNumber && confirming?.episodeNumber === e.episodeNumber;
            if (isConfirming) {
              // Same two-click pattern as every other delete: the row itself
              // became the single red confirm button.
              return (
                <button
                  key={`${e.seasonNumber}-${e.episodeNumber}`}
                  onClick={() => confirmDelete(e.seasonNumber, e.episodeNumber)}
                  disabled={status === 'loading'}
                  className="block w-full text-left px-3 py-1.5 text-xs font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-60"
                >
                  {status === 'loading' ? 'Deleting…' : `Really delete ${formatEpisode(e)}?`}
                </button>
              );
            }
            return (
              <button
                key={`${e.seasonNumber}-${e.episodeNumber}`}
                onClick={() => setConfirming({ seasonNumber: e.seasonNumber, episodeNumber: e.episodeNumber })}
                className="block w-full max-w-[16rem] truncate text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white"
              >
                {formatEpisode(e)}
                {e.title ? <span className="text-zinc-500"> · {e.title}</span> : null}
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
        className={buttonClass({ tone: 'success', error: status === 'error' })}
      >
        {status === 'loading' ? 'Marking…' : status === 'error' ? 'Failed - retry' : 'Watched'}
      </button>
      {/* Visible, not a hover-only title tooltip - touch/keyboard users could never see the reason. */}
      {disabled && <p className="text-xs text-zinc-500 mt-1">File deleted - nothing left to mark</p>}
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

  useDismissable(open, containerRef, () => setOpen(false));

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
        className={buttonClass({ tone: 'success', error: status === 'error' })}
      >
        {status === 'loading' ? 'Marking…' : status === 'error' ? 'Failed - retry' : 'Mark watched ▾'}
      </button>
      {open && (
        <div className="absolute right-0 mt-1 z-10 min-w-[110px] max-h-56 overflow-y-auto bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg">
          {(item.unwatchedEpisodes ?? []).map((e) => (
            <button
              key={`${e.seasonNumber}-${e.episodeNumber}`}
              onClick={() => markEpisode(e.seasonNumber, e.episodeNumber)}
              className="block w-full max-w-[16rem] truncate text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 hover:text-white"
            >
              {formatEpisode(e)}
              {e.title ? <span className="text-zinc-500"> · {e.title}</span> : null}
            </button>
          ))}
        </div>
      )}
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}


interface MissingAiredEpisode {
  episodeId: number;
  seriesId: number;
  tmdbId: number | null;
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
      className={buttonClass({ tone: 'primary', compact: true, error: status === 'error' })}
    >
      {status === 'loading' ? 'Searching…' : status === 'error' ? 'Failed - retry' : 'Search Again'}
    </button>
  );
}

/** One EpisodeSearch command for every still-unqueued missing episode of a show. */
function SearchAllButton({ seriesId, episodeIds, onStarted }: { seriesId: number; episodeIds: number[]; onStarted: () => void }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function handleClick() {
    setStatus('loading');
    try {
      const res = await fetch('/api/sonarr/search-episodes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId, episodeIds }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setStatus('idle');
      onStarted();
    } catch {
      setStatus('error');
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading' || episodeIds.length === 0}
      className={buttonClass({ tone: 'primary', error: status === 'error' })}
    >
      {status === 'loading' ? 'Searching…' : status === 'error' ? 'Failed - retry' : 'Search all'}
    </button>
  );
}

/** "Give up" on a missing episode - unmonitors it so Sonarr stops trying, since there's no file to delete in the first place. */
function GiveUpEpisodeButton({ episodeId, onGivenUp }: { episodeId: number; onGivenUp: () => void }) {
  return (
    <ConfirmButton
      compact
      label="Give up"
      confirmLabel="Really give up?"
      busyLabel="Giving up…"
      onSuccess={onGivenUp}
      action={async () => {
        const res = await fetch('/api/sonarr/give-up-episode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ episodeId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Failed');
      }}
    />
  );
}

interface MissingShowGroup {
  seriesId: number;
  tmdbId: number | null;
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
function MissingAiredSection({
  onEpisodeAvailable,
  onCountChange,
}: {
  onEpisodeAvailable: () => void;
  onCountChange: (count: number) => void;
}) {
  const [episodes, setEpisodes] = useState<MissingAiredEpisode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [searchingIds, setSearchingIds] = useState<Set<number>>(new Set());
  // Mirror for the refresh below, which compares against the current set
  // without doing work inside a state updater.
  const searchingRef = useRef(searchingIds);
  searchingRef.current = searchingIds;
  // Sonarr's queue keyed by episodeId - a searched episode that actually got
  // grabbed shows its real state (queued / percent / importing) instead of
  // sitting on "Searching…" until it vanishes from the list.
  const [queueMap, setQueueMap] = useState<Record<number, { percent: number; state: string }>>({});

  function fetchMissing() {
    const missingReq = fetch('/api/sonarr/missing', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const next: MissingAiredEpisode[] = data.episodes;
        const nextIds = new Set(next.map((e) => e.episodeId));

        const tracked = searchingRef.current;
        const stillMissing = new Set(Array.from(tracked).filter((id) => nextIds.has(id)));
        if (stillMissing.size !== tracked.size) onEpisodeAvailable(); // something we were tracking dropped off the missing list: it landed
        setSearchingIds(stillMissing);
        setEpisodes(next);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    const queueReq = fetch('/api/sonarr/episode-queue', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.episodes) setQueueMap(data.episodes);
      })
      .catch(() => {});
    return Promise.all([missingReq, queueReq]);
  }

  useEffect(() => {
    fetchMissing();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep polling while anything here is in flight - a search someone just
  // clicked, or an episode already moving through the download queue.
  const inFlightCount = searchingIds.size + (episodes ?? []).filter((e) => queueMap[e.episodeId]).length;
  useEffect(() => {
    if (inFlightCount === 0) return;
    const interval = setInterval(fetchMissing, MISSING_POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inFlightCount === 0]);

  function markSearching(episodeId: number) {
    setSearchingIds((prev) => new Set(prev).add(episodeId));
  }

  function markSearchingMany(episodeIds: number[]) {
    setSearchingIds((prev) => new Set([...Array.from(prev), ...episodeIds]));
  }

  function handleGaveUpSeries(seriesId: number) {
    setEpisodes((prev) => (prev ? prev.filter((e) => e.seriesId !== seriesId) : prev));
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

  useEffect(() => {
    onCountChange(episodes?.length ?? 0);
  }, [episodes, onCountChange]);

  if (error || (episodes && episodes.length === 0)) return null;

  const groups: MissingShowGroup[] = [];
  if (episodes) {
    const bySeriesId = new Map<number, MissingShowGroup>();
    for (const e of episodes) {
      let g = bySeriesId.get(e.seriesId);
      if (!g) {
        g = { seriesId: e.seriesId, tmdbId: e.tmdbId, seriesTitle: e.seriesTitle, hasPoster: e.hasPoster, episodes: [] };
        bySeriesId.set(e.seriesId, g);
      }
      g.episodes.push(e);
    }
    groups.push(...Array.from(bySeriesId.values()).sort((a, b) => a.seriesTitle.localeCompare(b.seriesTitle)));
  }

  return (
    <div id="section-aired-not-downloaded" className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
        Aired, Not Downloaded{episodes && episodes.length > 0 ? ` (${episodes.length})` : ''}
      </h2>
      <div className="space-y-2">
        {!episodes
          ? [1, 2].map((i) => <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />)
          : groups.map((g) => {
              const unqueuedIds = g.episodes.filter((e) => !queueMap[e.episodeId]).map((e) => e.episodeId);
              return (
              <div key={g.seriesId} className="bg-zinc-900 rounded-lg ring-1 ring-white/5 overflow-hidden">
                <div className="flex items-center gap-3 p-3">
                  {/* Poster links to the detail page; the rest of the row keeps its expand behavior. */}
                  {g.tmdbId ? (
                    <Link href={`/tv/${g.tmdbId}`} className="flex-shrink-0 hover:opacity-80 transition-opacity">
                      <Poster id={g.seriesId} hasPoster={g.hasPoster} title={g.seriesTitle} service="sonarr" />
                    </Link>
                  ) : (
                    <Poster id={g.seriesId} hasPoster={g.hasPoster} title={g.seriesTitle} service="sonarr" />
                  )}
                  <button
                    onClick={() => setExpanded((prev) => (prev === g.seriesId ? null : g.seriesId))}
                    className="flex items-center gap-3 text-left min-w-0 flex-1"
                  >
                    <span className={`text-zinc-500 text-xs transition-transform ${expanded === g.seriesId ? 'rotate-90' : ''}`}>▶</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">{g.seriesTitle}</p>
                      <p className="text-xs text-zinc-500">
                        {g.episodes.length} episode{g.episodes.length === 1 ? '' : 's'} missing
                      </p>
                    </div>
                  </button>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <SearchAllButton seriesId={g.seriesId} episodeIds={unqueuedIds} onStarted={() => markSearchingMany(unqueuedIds)} />
                    <ConfirmButton
                      compact
                      label="Give up all"
                      confirmLabel="Really give up all?"
                      busyLabel="Giving up…"
                      onSuccess={() => handleGaveUpSeries(g.seriesId)}
                      action={async () => {
                        const res = await fetch('/api/sonarr/give-up-episodes', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ episodeIds: g.episodes.map((e) => e.episodeId) }),
                        });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error ?? 'Failed');
                      }}
                    />
                  </div>
                </div>
                {expanded === g.seriesId && (
                  <div className="px-3 pb-3 space-y-1">
                    {g.episodes.map((e) => {
                      const q = queueMap[e.episodeId];
                      return (
                      <div key={e.episodeId} className="flex items-center justify-between bg-zinc-800/40 rounded px-2.5 py-1.5">
                        <p className="text-xs text-zinc-300 truncate pr-2">
                          <span className="text-zinc-500">
                            S{String(e.seasonNumber).padStart(2, '0')}E{String(e.episodeNumber).padStart(2, '0')}
                          </span>{' '}
                          {e.title}
                          <span className="text-zinc-500"> · aired {formatAirDate(e.airDateUtc)}</span>
                        </p>
                        <div className="flex items-center gap-1.5 flex-shrink-0">
                          {q ? (
                            // 0% still counts as queued visually - SAB/NZBGet pull one
                            // download at a time, so most of a batch sits at zero bytes.
                            <span className="text-xs font-medium text-sky-400">
                              {q.state === 'importing' ? 'Importing…' : q.state === 'queued' || q.percent === 0 ? 'Queued' : `↓ ${q.percent}%`}
                            </span>
                          ) : (
                            <SearchMissingButton
                              episode={e}
                              searching={searchingIds.has(e.episodeId)}
                              onSearchStarted={() => markSearching(e.episodeId)}
                            />
                          )}
                          <GiveUpEpisodeButton episodeId={e.episodeId} onGivenUp={() => handleGivenUp(e.episodeId)} />
                        </div>
                      </div>
                      );
                    })}
                  </div>
                )}
              </div>
              );
            })}
      </div>
    </div>
  );
}

interface MissingMovie {
  movieId: number;
  tmdbId: number | null;
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
      className={buttonClass({ tone: 'primary', error: status === 'error' })}
    >
      {status === 'loading' ? 'Searching…' : status === 'error' ? 'Failed - retry' : 'Search Again'}
    </button>
  );
}

/** Gives up on a missing movie by removing it from Radarr entirely - unlike a missing episode there's no partial series to preserve, so full removal (same as the regular movie Delete button) is the only sensible "stop asking" action. */
function MissingMovieDeleteButton({ movieId, onDeleted }: { movieId: number; onDeleted: () => void }) {
  return (
    <ConfirmButton
      label="Delete"
      confirmLabel="Really delete?"
      busyLabel="Deleting…"
      onSuccess={onDeleted}
      action={async () => {
        const res = await fetch('/api/radarr/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ movieId }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      }}
    />
  );
}

/** Movies Radarr has monitored, has no file for, and hasn't found on any indexer - the movie equivalent of MissingAiredSection, added since Radarr has no built-in concept mirroring Sonarr's air-date gap. */
function MissingMoviesSection({ onCountChange }: { onCountChange: (count: number) => void }) {
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

  useEffect(() => {
    onCountChange(movies?.length ?? 0);
  }, [movies, onCountChange]);

  if (error || (movies && movies.length === 0)) return null;

  return (
    <div id="section-movies-not-found" className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
        Movies Not Found{movies && movies.length > 0 ? ` (${movies.length})` : ''}
      </h2>
      <div className="space-y-2">
        {!movies
          ? [1, 2].map((i) => <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />)
          : movies.map((m) => (
              <div key={m.movieId} className="flex items-center gap-3 bg-zinc-900 rounded-lg ring-1 ring-white/5 p-3">
                {m.tmdbId ? (
                  <Link href={`/documentary/${m.tmdbId}`} className="flex items-center gap-3 min-w-0 flex-1 hover:opacity-80 transition-opacity">
                    <Poster id={m.movieId} hasPoster={m.hasPoster} title={m.title} service="radarr" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate">
                        {m.title} <span className="text-zinc-500">({m.year})</span>
                      </p>
                      {m.releaseDate && <p className="text-xs text-zinc-500">released {formatAirDate(m.releaseDate)}</p>}
                    </div>
                  </Link>
                ) : (
                <>
                <Poster id={m.movieId} hasPoster={m.hasPoster} title={m.title} service="radarr" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">
                    {m.title} <span className="text-zinc-500">({m.year})</span>
                  </p>
                  {m.releaseDate && <p className="text-xs text-zinc-500">released {formatAirDate(m.releaseDate)}</p>}
                </div>
                </>
                )}
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


interface StalledShow {
  seriesId: number;
  title: string;
  tmdbId: number | null;
  hasPoster: boolean;
  watchedOnDisk: number;
  totalOnDisk: number;
  daysSince: number;
  nextUp: { seasonNumber: number; episodeNumber: number } | null;
}

function formatDaysAgo(days: number): string {
  if (days >= 365) {
    const years = Math.floor(days / 365);
    return years === 1 ? 'over a year ago' : `over ${years} years ago`;
  }
  if (days >= 60) return `${Math.floor(days / 30)} months ago`;
  return `${days} days ago`;
}

/**
 * Shows you watched most of, then quietly dropped - a nudge to finish the
 * story. Rows link to the show's detail page when the TMDB id is known.
 * The days threshold lives in Settings > App Config > App Behavior
 * (STALLED_SHOW_DAYS); 0 there turns this whole section off server-side.
 */
function StalledShowsSection({ onCountChange }: { onCountChange: (count: number) => void }) {
  const [shows, setShows] = useState<StalledShow[] | null>(null);

  useEffect(() => {
    fetch('/api/stalled-shows', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (Array.isArray(data.shows)) setShows(data.shows);
        else setShows([]);
      })
      .catch(() => setShows([]));
  }, []);

  useEffect(() => {
    onCountChange(shows?.length ?? 0);
  }, [shows, onCountChange]);

  if (!shows || shows.length === 0) return null;

  return (
    <div id="section-finish-the-story" className="space-y-2">
      <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
        Finish the Story? ({shows.length})
      </h2>
      <p className="text-xs text-zinc-500">
        Shows you watched most of, then stopped. Still on disk, still waiting.
      </p>
      <div className="space-y-2">
        {shows.map((s) => {
          const body = (
            <>
              <Poster id={s.seriesId} hasPoster={s.hasPoster} title={s.title} service="sonarr" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate">{s.title}</p>
                <p className="text-xs text-zinc-500">
                  Watched {s.watchedOnDisk} of {s.totalOnDisk} · last watched {formatDaysAgo(s.daysSince)}
                  {s.nextUp && <> · next up {formatEpisode(s.nextUp)}</>}
                </p>
              </div>
            </>
          );
          const rowClass = 'flex items-center gap-3 bg-zinc-900 rounded-lg ring-1 ring-white/5 p-3';
          return s.tmdbId ? (
            <a key={s.seriesId} href={`/tv/${s.tmdbId}`} className={`${rowClass} hover:ring-amber-500/50 transition-colors`}>
              {body}
            </a>
          ) : (
            <div key={s.seriesId} className={rowClass}>
              {body}
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
  onAftermath,
}: {
  item: ReadyToWatchItem;
  onWatched: () => void;
  onEpisodeWatched: (seasonNumber: number, episodeNumber: number) => void;
  onEpisodeDeleted: (seasonNumber: number, episodeNumber: number) => void;
  onAftermath: (a: DeleteAftermath) => void;
}) {
  // Movies only - once the file's deleted, Plex drops it from its own index almost
  // immediately, so a later Watched click has nothing left to mark. TV doesn't need
  // this: deleting a specific episode already removes it from both dropdowns at once.
  const [movieDeleted, setMovieDeleted] = useState(false);

  // Poster and title link to the detail page when the TMDB id is known. The
  // episode line with its "+N more" toggle sits beside the link rather than
  // inside it: a button inside an anchor is invalid markup.
  const detailHref = item.tmdbId ? (item.type === 'tv' ? `/tv/${item.tmdbId}` : `/documentary/${item.tmdbId}`) : null;
  const poster = <Poster id={item.id} hasPoster={Boolean(item.posterPath)} title={item.title} service={item.type === 'movie' ? 'radarr' : 'sonarr'} />;
  const heading = (
    <>
      {item.title}{' '}
      {item.type === 'movie' && item.year
        ? `(${item.year})`
        : item.type === 'tv' && item.unwatchedEpisodes
        ? `(${item.unwatchedEpisodes.length} Episode${item.unwatchedEpisodes.length === 1 ? '' : 's'})`
        : ''}
    </>
  );

  return (
    <div className="flex items-center justify-between bg-zinc-900 rounded-lg p-3 ring-1 ring-white/5">
      <div className="flex items-center gap-3 min-w-0">
        {detailHref ? (
          <Link href={detailHref} className="flex-shrink-0 hover:opacity-80 transition-opacity">
            {poster}
          </Link>
        ) : (
          poster
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            {detailHref ? (
              <Link href={detailHref} className="hover:text-amber-400 transition-colors">
                {heading}
              </Link>
            ) : (
              heading
            )}
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
            {/* Once deleted there is nothing left to delete - a second click only errors. */}
            {movieDeleted ? (
              <span className="text-xs font-medium text-zinc-500">Deleted</span>
            ) : (
              <MovieDeleteButton item={item} onDeleted={() => setMovieDeleted(true)} />
            )}
          </>
        ) : (
          <>
            <ShowWatchedDropdown item={item} onEpisodeWatched={onEpisodeWatched} />
            {item.protected ? (
              <span
                title="On the Cleanup Excluded Shows list - deletes through Weavarr are blocked to protect these files."
                className="px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 bg-amber-500/15 text-amber-400 ring-amber-500/25"
              >
                Protected
              </span>
            ) : (
              <ShowDeleteDropdown item={item} onEpisodeDeleted={onEpisodeDeleted} onAftermath={onAftermath} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** Jumps to a section's own heading rather than a fixed scroll offset, since section heights vary with content and page size. */
function SectionTile({ label, singularLabel, count, targetId }: { label: string; singularLabel?: string; count: number; targetId: string }) {
  return (
    <button
      onClick={() => document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
      className="flex-shrink-0 text-left px-4 py-2.5 rounded-lg bg-zinc-900 ring-1 ring-white/5 hover:ring-amber-500/50 hover:bg-zinc-800 transition-colors"
    >
      <p className="text-xl font-bold text-white leading-none">{count}</p>
      <p className="text-xs text-zinc-500 uppercase tracking-wider mt-1 whitespace-nowrap">{count === 1 && singularLabel ? singularLabel : label}</p>
    </button>
  );
}

export default function ReadyToWatchPanel() {
  const [items, setItems] = useState<ReadyToWatchItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [missingAiredCount, setMissingAiredCount] = useState(0);
  const [missingMoviesCount, setMissingMoviesCount] = useState(0);
  const [stalledCount, setStalledCount] = useState(0);
  const [aftermath, setAftermath] = useState<DeleteAftermath | null>(null);
  const [recentlyWatchedCount, setRecentlyWatchedCount] = useState(0);

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

  // Reveal-on-scroll for both lists; the items themselves are derived below
  // (after the early returns), so track counts via what the last render saw.
  // Hooks must sit above the early returns.
  const tvReveal = useInfiniteReveal((items ?? []).filter((i) => i.type === 'tv').length, query, PAGE_SIZE);
  const movieReveal = useInfiniteReveal((items ?? []).filter((i) => i.type === 'movie').length, query, PAGE_SIZE);

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

  const tvPaged = tvItems.slice(0, tvReveal.visible);
  const moviePaged = movieItems.slice(0, movieReveal.visible);

  function renderRow(item: ReadyToWatchItem) {
    return (
      <ReadyToWatchRow
        key={`${item.type}-${item.id}`}
        item={item}
        onWatched={() => setItems((prev) => (prev ?? []).filter((i) => !(i.type === item.type && i.id === item.id)))}
        onEpisodeWatched={(seasonNumber, episodeNumber) => removeUnwatchedEpisode(item.id, seasonNumber, episodeNumber)}
        onEpisodeDeleted={(seasonNumber, episodeNumber) => removeUnwatchedEpisode(item.id, seasonNumber, episodeNumber)}
        onAftermath={setAftermath}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-end text-sm text-zinc-500">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filter by title…"
          className="bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-500"
        />
      </div>
      {(tvItems.length > 0 ||
        movieItems.length > 0 ||
        missingAiredCount > 0 ||
        missingMoviesCount > 0 ||
        stalledCount > 0 ||
        recentlyWatchedCount > 0) && (
        <div className="flex flex-wrap gap-2">
          {tvItems.length > 0 && <SectionTile label="TV Shows" singularLabel="TV Show" count={tvItems.length} targetId="section-tv-shows" />}
          {movieItems.length > 0 && <SectionTile label="Movies" singularLabel="Movie" count={movieItems.length} targetId="section-movies" />}
          {missingAiredCount > 0 && (
            <SectionTile label="Aired, Not Downloaded" count={missingAiredCount} targetId="section-aired-not-downloaded" />
          )}
          {missingMoviesCount > 0 && (
            <SectionTile label="Movies Not Found" singularLabel="Movie Not Found" count={missingMoviesCount} targetId="section-movies-not-found" />
          )}
          {stalledCount > 0 && (
            <SectionTile label="Finish the Story?" count={stalledCount} targetId="section-finish-the-story" />
          )}
          {recentlyWatchedCount > 0 && (
            <SectionTile label="Recently Watched" count={recentlyWatchedCount} targetId="section-recently-watched" />
          )}
        </div>
      )}
      {filtered.length === 0 && (
        <p className="text-zinc-500 text-sm">Nothing unwatched right now - you&apos;re all caught up.</p>
      )}
      {tvItems.length > 0 && (
        <div id="section-tv-shows" className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            TV Shows ({tvItems.length})
          </h2>
          <div className="space-y-2">{tvPaged.map(renderRow)}</div>
          <div ref={tvReveal.sentinelRef} />
        </div>
      )}
      {movieItems.length > 0 && (
        <div id="section-movies" className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">
            Movies ({movieItems.length})
          </h2>
          <div className="space-y-2">{moviePaged.map(renderRow)}</div>
          <div ref={movieReveal.sentinelRef} />
        </div>
      )}
      <MissingAiredSection onEpisodeAvailable={refreshItems} onCountChange={setMissingAiredCount} />
      <MissingMoviesSection onCountChange={setMissingMoviesCount} />
      <StalledShowsSection onCountChange={setStalledCount} />
      <RecentlyWatchedSection onCountChange={setRecentlyWatchedCount} />
      <LastEpisodeModal key={aftermath?.seriesId ?? 'none'} aftermath={aftermath} onClose={() => setAftermath(null)} />
    </div>
  );
}
