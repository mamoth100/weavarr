'use client';

import { useEffect, useState } from 'react';

export interface SonarrEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  hasFile: boolean;
  sizeOnDisk: number;
  airDateUtc: string | null;
}

interface QualityProfileOption {
  id: number;
  name: string;
}

// Canonical copy lives in RecentlyWatchedSection - re-exported for existing importers.
export { formatBytes } from '@/components/RecentlyWatchedSection';
import { formatBytes } from '@/components/RecentlyWatchedSection';
import ConfirmButton from '@/components/ConfirmButton';
import { buttonClass } from '@/components/buttonClass';
import LastEpisodeModal, { type DeleteAftermath } from '@/components/LastEpisodeModal';

function isDownloadable(e: Pick<SonarrEpisode, 'hasFile' | 'airDateUtc'>): boolean {
  return !e.hasFile && !!e.airDateUtc && new Date(e.airDateUtc).getTime() <= Date.now();
}

function DeleteEpisodeButton({
  seriesId,
  seasonNumber,
  episodeNumber,
  onDeleted,
  onAftermath,
}: {
  seriesId: number;
  seasonNumber: number;
  episodeNumber: number;
  onDeleted: () => void;
  onAftermath: (a: DeleteAftermath) => void;
}) {
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-xs font-medium text-green-400">Deleted</span>;
  }

  return (
    <ConfirmButton
      compact
      label="Delete"
      confirmLabel="Really delete?"
      busyLabel="Deleting…"
      onSuccess={() => {
        setDone(true);
        onDeleted();
      }}
      action={async () => {
        const res = await fetch('/api/sonarr/delete-episode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ seriesId, seasonNumber, episodeNumber }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? 'Delete failed');
        if (data.after && data.after.remainingFiles === 0) onAftermath(data.after);
      }}
    />
  );
}

function SearchEpisodeButton({
  episodeId,
  seriesId,
  profileOverrideId,
  disabled,
}: {
  episodeId: number;
  seriesId: number;
  profileOverrideId?: number;
  disabled?: boolean;
}) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/sonarr/search-episode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ episodeId, seriesId, profileOverrideId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // We only know the search was triggered, not whether Sonarr actually found
  // and grabbed a release - point to Status instead of claiming a result.
  if (status === 'done') {
    return (
      <a
        href="/status"
        target="_blank"
        rel="noopener noreferrer"
        title="Sonarr searched and sent this to your downloader if a release was found - check Status for what's actually queued or downloading."
        className="text-xs font-medium text-green-400 hover:underline"
      >
        Sent to downloader
      </a>
    );
  }

  // A season-level search already covered this episode - show the same
  // muted state without a live click handler still wired up underneath.
  if (disabled && status === 'idle') {
    return (
      <a
        href="/status"
        target="_blank"
        rel="noopener noreferrer"
        title="A season search already covered this episode - check Status for what's actually queued or downloading."
        className="text-xs font-medium text-zinc-500 hover:underline"
      >
        Sent to downloader
      </a>
    );
  }

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={status === 'loading'}
        className={buttonClass({ tone: 'primary', compact: true, error: status === 'error' })}
      >
        {status === 'loading' ? 'Searching…' : status === 'error' ? 'Failed - retry' : 'Download'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function SeasonActions({
  seriesId,
  seasonNumber,
  hasDownloadable,
  hasFiles,
  profileOverrideId,
  onSearchStarted,
  onSeasonDeleted,
  onAftermath,
  deletable,
}: {
  seriesId: number;
  seasonNumber: number;
  hasDownloadable: boolean;
  hasFiles: boolean;
  profileOverrideId?: number;
  onSearchStarted: () => void;
  onSeasonDeleted: () => void;
  onAftermath: (a: DeleteAftermath) => void;
  deletable: boolean;
}) {
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleDownloadSeason() {
    setDownloadStatus('loading');
    setError(null);
    onSearchStarted();
    try {
      const res = await fetch('/api/sonarr/search-season', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId, seasonNumber, profileOverrideId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Search failed');
      setDownloadStatus('done');
    } catch (err) {
      setDownloadStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {hasDownloadable && (
        downloadStatus === 'done' ? (
          // We only know the search was triggered, not whether Sonarr actually
          // found and grabbed a release - point to Status instead of claiming a result.
          <a
            href="/status"
            target="_blank"
            rel="noopener noreferrer"
            title="Sonarr searched and sent this to your downloader if releases were found - check Status for what's actually queued or downloading."
            className={buttonClass({ tone: 'primary', compact: true })}
          >
            Sent to downloader
          </a>
        ) : (
          <button
            onClick={handleDownloadSeason}
            disabled={downloadStatus !== 'idle' && downloadStatus !== 'error'}
            className={buttonClass({ tone: 'primary', compact: true, error: downloadStatus === 'error' })}
          >
            {downloadStatus === 'loading' ? 'Searching…' : downloadStatus === 'error' ? 'Failed - retry' : 'Download Season'}
          </button>
        )
      )}
      {hasFiles && deletable && (
        <ConfirmButton
          compact
          label="Delete Season"
          confirmLabel="Really delete season?"
          busyLabel="Deleting…"
          onSuccess={onSeasonDeleted}
          action={async () => {
            const res = await fetch('/api/sonarr/delete-season', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ seriesId, seasonNumber }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? 'Delete failed');
            if (data.after && data.after.remainingFiles === 0) onAftermath(data.after);
          }}
        />
      )}
      {error && <span className="text-xs text-red-400">{error}</span>}
    </div>
  );
}

/**
 * Full season/episode breakdown for an already-added Sonarr series, with
 * per-episode and per-season download (search) and delete. Shared by the
 * Library page's TV Shows tab and the show detail page, so both offer the
 * exact same episode management once a series is in Sonarr.
 */
export default function SonarrEpisodeManager({ seriesId }: { seriesId: number }) {
  const [episodes, setEpisodes] = useState<SonarrEpisode[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searchingSeasons, setSearchingSeasons] = useState<Set<number>>(new Set());
  const [expandedSeasons, setExpandedSeasons] = useState<Set<number>>(new Set());
  const [aftermath, setAftermath] = useState<DeleteAftermath | null>(null);
  const [isProtected, setIsProtected] = useState(false);

  // One compact override for the whole show - applies to whichever season or
  // episode Download button gets clicked next, rather than a picker on every
  // single row. Collapsed by default; profiles are fetched lazily on open.
  const [showQualityOverride, setShowQualityOverride] = useState(false);
  const [profiles, setProfiles] = useState<QualityProfileOption[] | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [profileOverrideId, setProfileOverrideId] = useState<number | undefined>(undefined);

  function toggleQualityOverride() {
    setShowQualityOverride((prev) => {
      const next = !prev;
      if (next && profiles === null) {
        fetch('/api/sonarr/profiles', { cache: 'no-store' })
          .then((res) => res.json())
          .then((data) => {
            if (data.error) setProfilesError(data.error);
            else setProfiles(data.profiles);
          })
          .catch((err) => setProfilesError(err instanceof Error ? err.message : String(err)));
      }
      return next;
    });
  }

  useEffect(() => {
    fetch(`/api/sonarr/episodes?seriesId=${seriesId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else {
          setEpisodes(data.episodes);
          setIsProtected(Boolean(data.protected));
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [seriesId]);

  function markDeleted(episodeId: number) {
    setEpisodes((prev) => prev?.map((e) => (e.id === episodeId ? { ...e, hasFile: false, sizeOnDisk: 0 } : e)) ?? null);
  }

  function markSeasonDeleted(seasonNumber: number) {
    setEpisodes((prev) => prev?.map((e) => (e.seasonNumber === seasonNumber ? { ...e, hasFile: false, sizeOnDisk: 0 } : e)) ?? null);
  }

  if (error) return <p className="text-xs text-red-400">Failed to load episodes: {error}</p>;
  if (!episodes) {
    return (
      <div className="space-y-1.5">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-8 bg-zinc-800/60 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  const seasons = Array.from(new Set(episodes.map((e) => e.seasonNumber))).sort((a, b) => a - b);
  const activeOverrideName = profiles?.find((p) => p.id === profileOverrideId)?.name;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {isProtected && (
          <span className="text-[11px] font-medium text-amber-400">
            Protected show - deletes are disabled to keep these files safe
          </span>
        )}
        <button
          type="button"
          onClick={toggleQualityOverride}
          className="text-[11px] text-zinc-500 hover:text-zinc-400 underline decoration-dotted"
        >
          {showQualityOverride ? 'Hide quality override' : activeOverrideName ? `Quality: ${activeOverrideName}` : 'Quality override'}
        </button>
        {showQualityOverride && (
          <>
            {profilesError && <span className="text-[11px] text-red-400">{profilesError}</span>}
            {!profilesError && (
              <select
                value={profileOverrideId ?? ''}
                onChange={(e) => setProfileOverrideId(e.target.value ? Number(e.target.value) : undefined)}
                disabled={profiles === null}
                aria-label="Override quality profile for downloads from this show"
                className="px-2 py-1 rounded-lg text-[11px] bg-zinc-800 text-zinc-300 border border-zinc-700 disabled:opacity-60"
              >
                <option value="">{profiles === null ? 'Loading profiles…' : "Use show's current profile"}</option>
                {profiles?.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
      {seasons.map((seasonNumber) => {
        const seasonEpisodes = episodes.filter((e) => e.seasonNumber === seasonNumber);
        const searching = searchingSeasons.has(seasonNumber);
        const isExpanded = expandedSeasons.has(seasonNumber);
        const onDisk = seasonEpisodes.filter((e) => e.hasFile).length;
        return (
          <div key={seasonNumber}>
            <div className="flex items-center justify-between mb-1 gap-2">
              {/* Collapsed by default - a thirty-season show was a five-minute scroll. */}
              <button
                type="button"
                onClick={() =>
                  setExpandedSeasons((prev) => {
                    const next = new Set(prev);
                    if (next.has(seasonNumber)) next.delete(seasonNumber);
                    else next.add(seasonNumber);
                    return next;
                  })
                }
                className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 uppercase tracking-wider hover:text-zinc-300 py-1 touch:py-2"
              >
                <span className={`inline-block transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▸</span>
                {seasonNumber === 0 ? 'Specials' : `Season ${seasonNumber}`}
                <span className="normal-case font-normal tracking-normal text-zinc-600">
                  {onDisk} of {seasonEpisodes.length} on disk
                </span>
              </button>
              <SeasonActions
                seriesId={seriesId}
                seasonNumber={seasonNumber}
                hasDownloadable={seasonEpisodes.some((e) => isDownloadable(e))}
                hasFiles={seasonEpisodes.some((e) => e.hasFile)}
                profileOverrideId={profileOverrideId}
                onSearchStarted={() => setSearchingSeasons((prev) => new Set(prev).add(seasonNumber))}
                onSeasonDeleted={() => markSeasonDeleted(seasonNumber)}
                onAftermath={setAftermath}
                deletable={!isProtected}
              />
            </div>
            {isExpanded && (
            <div className="space-y-1">
              {seasonEpisodes.map((e) => (
                <div key={e.id} className="flex items-center justify-between bg-zinc-800/40 rounded px-2.5 py-1.5">
                  <p className="text-xs text-zinc-300 truncate pr-2">
                    <span className="text-zinc-500">
                      S{String(e.seasonNumber).padStart(2, '0')}E{String(e.episodeNumber).padStart(2, '0')}
                    </span>{' '}
                    {e.title}
                  </p>
                  {e.hasFile ? (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="text-xs text-zinc-500">{formatBytes(e.sizeOnDisk)}</span>
                      {!isProtected && (
                        <DeleteEpisodeButton
                          seriesId={seriesId}
                          seasonNumber={e.seasonNumber}
                          episodeNumber={e.episodeNumber}
                          onDeleted={() => markDeleted(e.id)}
                          onAftermath={setAftermath}
                        />
                      )}
                    </div>
                  ) : isDownloadable(e) ? (
                    <SearchEpisodeButton
                      episodeId={e.id}
                      seriesId={seriesId}
                      profileOverrideId={profileOverrideId}
                      disabled={searching}
                    />
                  ) : (
                    <span className="text-xs text-zinc-700 flex-shrink-0">{e.airDateUtc ? 'Not aired yet' : 'TBA'}</span>
                  )}
                </div>
              ))}
            </div>
            )}
          </div>
        );
      })}
      <LastEpisodeModal key={aftermath?.seriesId ?? 'none'} aftermath={aftermath} onClose={() => setAftermath(null)} />
    </div>
  );
}
