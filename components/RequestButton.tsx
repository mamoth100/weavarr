'use client';

import { useEffect, useRef, useState } from 'react';
import type { TmdbSeason } from '@/types';
import ConfirmButton from '@/components/ConfirmButton';
import RequestShowModal from '@/components/RequestShowModal';
import { useDownloadProgress, refreshDownloadProgressSoon } from '@/hooks/useDownloadProgress';

/** "Is this show watching for new episodes?" chip - answers the monitoring question right on the page instead of requiring a trip into the Get more modal. */
function MonitoringChip({ tmdbId, refreshKey }: { tmdbId: number; refreshKey: number }) {
  const [monitorFuture, setMonitorFuture] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/sonarr/series-state?tmdbId=${tmdbId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && !data.error) setMonitorFuture(Boolean(data.monitorFuture));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tmdbId, refreshKey]);

  if (monitorFuture === null) return null;
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[11px] font-medium ring-1 ${
        monitorFuture
          ? 'bg-green-500/15 text-green-400 ring-green-500/25'
          : 'bg-zinc-500/15 text-zinc-400 ring-zinc-500/25'
      }`}
      title='Change this with "Get more" - the future-episodes toggle'
    >
      {monitorFuture ? 'Auto-grabbing new episodes' : 'Not watching for new episodes'}
    </span>
  );
}

/** Live download bar under the detail-page action - appears whenever this title has something in the Radarr/Sonarr queue. */
function DetailDownloadProgress({ id, mediaType }: { id: number; mediaType: 'movie' | 'tv' }) {
  const progressMap = useDownloadProgress();
  const progress = progressMap ? (mediaType === 'tv' ? progressMap.shows[id] : progressMap.movies[id]) : undefined;
  if (!progress) return null;
  return (
    <div className="flex items-center gap-2 mt-1.5 w-48">
      <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
        <div className="h-full bg-sky-500 rounded-full transition-all" style={{ width: `${progress.percent}%` }} />
      </div>
      <span className="text-xs text-sky-400 font-medium whitespace-nowrap">
        {progress.state === 'importing' ? 'Importing…' : progress.state === 'queued' ? 'Queued' : `${progress.percent}%`}
      </span>
    </div>
  );
}

interface Props {
  id: number;
  mediaType: 'movie' | 'tv';
  title: string;
  poster_path: string | null;
  release_date: string;
  imdbId?: string | null;
  seasons?: TmdbSeason[];
  radarrMovieId?: number | null;
  sonarrSeriesId?: number | null;
}

interface QualityFlags {
  radarrHighestConfigured: boolean;
  sonarrHighestConfigured: boolean;
}

// Shared across every RequestButton on the page (e.g. a whole search grid) so
// this fires once, not once per card.
let qualityFlagsPromise: Promise<QualityFlags> | null = null;
function getQualityFlags(): Promise<QualityFlags> {
  if (!qualityFlagsPromise) {
    qualityFlagsPromise = fetch('/api/settings/quality-flags', { cache: 'no-store' })
      .then((res) => res.json())
      .catch(() => {
        qualityFlagsPromise = null; // let the next mount retry instead of caching a failure forever
        return { radarrHighestConfigured: true, sonarrHighestConfigured: true };
      });
  }
  return qualityFlagsPromise;
}

function DeleteMovieButton({ movieId }: { movieId: number }) {
  const [done, setDone] = useState(false);

  if (done) {
    return <span className="text-xs font-medium text-green-400 inline-block">Deleted</span>;
  }

  return (
    <ConfirmButton
      label="Delete from Radarr"
      confirmLabel="Really delete?"
      busyLabel="Deleting…"
      onSuccess={() => setDone(true)}
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

/** Delete with a choice: episode files only (registration stays, future setting untouched) or the whole series. Protected shows render a badge instead - the API refuses anyway, but the button shouldn't even exist. */
function DeleteSeriesButton({ seriesId }: { seriesId: number }) {
  const [mode, setMode] = useState<'idle' | 'choose' | 'busy' | 'doneFiles' | 'doneAll' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [isProtected, setIsProtected] = useState<boolean | null>(null);

  useEffect(() => {
    fetch(`/api/sonarr/episodes?seriesId=${seriesId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setIsProtected(Boolean(data.protected)))
      .catch(() => setIsProtected(false));
  }, [seriesId]);

  if (isProtected === null) return null;
  if (isProtected) {
    return (
      <span
        title="On the Cleanup Excluded Shows list - deletes through Weavarr are blocked to protect these files."
        className="px-2.5 py-1.5 rounded-lg text-xs font-medium ring-1 bg-amber-500/15 text-amber-400 ring-amber-500/25 inline-block"
      >
        Protected
      </span>
    );
  }

  async function run(kind: 'files' | 'all') {
    setMode('busy');
    setError(null);
    try {
      const res = await fetch(kind === 'all' ? '/api/sonarr/delete' : '/api/sonarr/delete-files', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setMode(kind === 'all' ? 'doneAll' : 'doneFiles');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMode('error');
    }
  }

  if (mode === 'doneAll') return <span className="text-xs font-medium text-green-400 inline-block">Removed from Sonarr</span>;
  if (mode === 'doneFiles') return <span className="text-xs font-medium text-green-400 inline-block">Episodes deleted - show still tracked</span>;

  if (mode === 'choose' || mode === 'busy') {
    return (
      <span className="inline-flex items-center gap-1.5 flex-wrap">
        <button
          onClick={() => run('files')}
          disabled={mode === 'busy'}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600/80 text-white hover:bg-red-500 disabled:opacity-60"
        >
          {mode === 'busy' ? 'Working…' : 'Episodes only'}
        </button>
        <button
          onClick={() => run('all')}
          disabled={mode === 'busy'}
          className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-700 text-white hover:bg-red-600 disabled:opacity-60"
        >
          Completely remove
        </button>
        <button
          onClick={() => setMode('idle')}
          disabled={mode === 'busy'}
          className="px-2 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
        >
          Cancel
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        onClick={() => setMode('choose')}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
          mode === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-red-600 hover:text-white'
        }`}
      >
        {mode === 'error' ? 'Failed - retry' : 'Delete from Sonarr'}
      </button>
      {error && <span className="text-xs text-red-400 line-clamp-3 max-w-xs">{error}</span>}
    </span>
  );
}

type Status = 'idle' | 'loading' | 'added' | 'already' | 'error';

interface QualityProfileOption {
  id: number;
  name: string;
}


export default function RequestButton({ id, mediaType, title, poster_path, release_date, imdbId, seasons, radarrMovieId, sonarrSeriesId }: Props) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);

  // Card-grid callers (search results) don't have the season list yet - fetch
  // it lazily so the picker still defaults to the latest season instead of "All"
  const [fetchedSeasons, setFetchedSeasons] = useState<TmdbSeason[] | null>(null);
  useEffect(() => {
    if (mediaType !== 'tv' || seasons) return;
    fetch(`/api/tmdb/seasons?id=${id}`)
      .then((res) => res.json())
      .then((data) => { if (Array.isArray(data.seasons)) setFetchedSeasons(data.seasons); })
      .catch(() => {});
  }, [mediaType, seasons, id]);

  // Seasons from TMDB with actual episodes - Specials (season 0) included,
  // the modal renders them as their own requestable row.
  const realSeasons = (seasons ?? fetchedSeasons ?? []).filter((s) => s.season_number >= 0 && s.episode_count > 0);

  // TV requests go through the modal (season checkboxes, quality) - the old
  // inline <select> could only pick a single season or preset.
  const [modalOpen, setModalOpen] = useState(false);
  // Bumped after a modal save so the monitoring chip refetches its state.
  const [monitoringRefresh, setMonitoringRefresh] = useState(0);

  const [highestQuality, setHighestQuality] = useState(false);
  // Assume configured until told otherwise, so the common (already-set-up) case never flickers.
  const [highestConfigured, setHighestConfigured] = useState(true);
  useEffect(() => {
    getQualityFlags().then((flags) => {
      setHighestConfigured(mediaType === 'movie' ? flags.radarrHighestConfigured : flags.sonarrHighestConfigured);
    });
  }, [mediaType]);

  // Advanced profile picker - collapsed by default so the one-click flow never changes;
  // profiles are fetched lazily, only once the user actually opens it.
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [profiles, setProfiles] = useState<QualityProfileOption[] | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [profileOverride, setProfileOverride] = useState('');

  function toggleAdvanced() {
    setShowAdvanced((prev) => {
      const next = !prev;
      if (next && profiles === null) {
        fetch(mediaType === 'movie' ? '/api/radarr/profiles' : '/api/sonarr/profiles', { cache: 'no-store' })
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

  const locked = status === 'loading' || status === 'added' || status === 'already';
  // Guards against a stale `true` if the checkbox was checked before the
  // Settings check resolved false out from under it.
  const effectiveHighestQuality = highestQuality && highestConfigured;

  /** Movie-only instant add - TV goes through RequestShowModal instead. */
  async function handleClick() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/radarr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tmdbId: id, highestQuality: effectiveHighestQuality, profileOverride: profileOverride || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      setStatus(data.alreadyAdded ? 'already' : 'added');
      refreshDownloadProgressSoon();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Neutral labels - a user shouldn't need to know what Radarr/Sonarr are to
  // add something (public-release jargon pass, UX review 2026-08-14).
  const label =
    status === 'loading' ? 'Adding…' :
    status === 'added' ? 'Added' :
    status === 'already' ? 'Already added' :
    status === 'error' ? 'Failed - retry' :
    mediaType === 'movie' ? 'Add Movie' : 'Add Show';

  if (mediaType === 'movie' && radarrMovieId) {
    return (
      <div>
        <DeleteMovieButton movieId={radarrMovieId} />
        <DetailDownloadProgress id={id} mediaType="movie" />
      </div>
    );
  }

  if (mediaType === 'tv' && sonarrSeriesId) {
    return (
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Get more
          </button>
          <DeleteSeriesButton seriesId={sonarrSeriesId} />
          <MonitoringChip tmdbId={id} refreshKey={monitoringRefresh} />
        </div>
        <DetailDownloadProgress id={id} mediaType="tv" />
        <RequestShowModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={title}
          imdbId={imdbId ?? null}
          seasons={realSeasons}
          tmdbId={id}
          highestConfigured={highestConfigured}
          onSuccess={() => {
            refreshDownloadProgressSoon();
            setMonitoringRefresh((k) => k + 1);
          }}
        />
      </div>
    );
  }

  if (mediaType === 'tv') {
    return (
      <>
        <button
          onClick={() => setModalOpen(true)}
          disabled={locked}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors
            ${
              status === 'added' || status === 'already'
                ? 'bg-green-600 text-white'
                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
            }`}
          aria-label={`Request "${title}" download`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          {label}
        </button>
        <DetailDownloadProgress id={id} mediaType="tv" />
        <RequestShowModal
          open={modalOpen}
          onClose={() => setModalOpen(false)}
          title={title}
          imdbId={imdbId ?? null}
          seasons={realSeasons}
          tmdbId={id}
          highestConfigured={highestConfigured}
          onSuccess={(alreadyAdded) => {
            setStatus(alreadyAdded ? 'already' : 'added');
            refreshDownloadProgressSoon();
          }}
        />
      </>
    );
  }

  return (
    <>
      <div className="flex flex-col gap-1.5">
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
        <label
          className={`flex items-center gap-1.5 text-xs select-none ${
            profileOverride || !highestConfigured ? 'text-zinc-700' : 'text-zinc-500'
          }`}
          title={!highestConfigured ? 'Set a Highest Quality Profile in Settings to use this' : undefined}
        >
          <input
            type="checkbox"
            checked={highestQuality && highestConfigured}
            onChange={(e) => setHighestQuality(e.target.checked)}
            disabled={locked || Boolean(profileOverride) || !highestConfigured}
            className="accent-amber-400"
          />
          Download highest quality
        </label>
        <button
          type="button"
          onClick={toggleAdvanced}
          disabled={locked}
          className="text-[11px] text-zinc-500 hover:text-zinc-400 underline decoration-dotted self-start disabled:opacity-60"
        >
          {showAdvanced ? 'Hide advanced' : 'Advanced: pick profile'}
        </button>
        {showAdvanced && (
          <div className="space-y-1">
            {profilesError && <p className="text-xs text-red-400 max-w-xs">{profilesError}</p>}
            {!profilesError && (
              <select
                value={profileOverride}
                onChange={(e) => setProfileOverride(e.target.value)}
                disabled={locked || profiles === null}
                aria-label="Override quality profile for this request"
                className="w-full px-2 py-1.5 rounded-lg text-xs bg-zinc-800 text-zinc-300 border border-zinc-700 disabled:opacity-60"
              >
                <option value="">
                  {profiles === null ? 'Loading profiles…' : 'Use default / highest toggle above'}
                </option>
                {profiles?.map((p) => (
                  <option key={p.id} value={p.name}>{p.name}</option>
                ))}
              </select>
            )}
          </div>
        )}
        {error && <p className="text-xs text-red-400 max-w-xs">{error}</p>}
        <DetailDownloadProgress id={id} mediaType="movie" />
      </div>
    </>
  );
}
