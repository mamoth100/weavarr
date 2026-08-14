'use client';

import { useEffect, useRef, useState } from 'react';
import { useWatchlist } from '@/hooks/useWatchlist';
import type { WatchlistItem } from '@/lib/watchlist';
import type { TmdbSeason } from '@/types';

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
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
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
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === 'done') {
    return <span className="text-xs font-medium text-green-400 inline-block">Deleted</span>;
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
        {status === 'error' ? 'Failed - retry' : 'Delete from Radarr'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

function DeleteSeriesButton({ seriesId }: { seriesId: number }) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleConfirm() {
    setStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/sonarr/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seriesId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  if (status === 'done') {
    return <span className="text-xs font-medium text-green-400 inline-block">Deleted</span>;
  }

  if (status === 'confirm' || status === 'loading') {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-zinc-400">Delete this show?</span>
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
        {status === 'error' ? 'Failed - retry' : 'Delete from Sonarr'}
      </button>
      {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
    </div>
  );
}

type Status = 'idle' | 'loading' | 'added' | 'already' | 'error';

interface QualityProfileOption {
  id: number;
  name: string;
}

const PRESET_OPTIONS = [
  { value: 'all', label: 'All Seasons' },
  { value: 'future', label: 'Future Only' },
  { value: 'pilot', label: 'Pilot Only' },
] as const;

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

  // Real seasons from TMDB, numbered and with episodes - excludes Specials (season 0)
  const realSeasons = (seasons ?? fetchedSeasons ?? []).filter((s) => s.season_number > 0 && s.episode_count > 0);
  const latestSeason = realSeasons.reduce((max, s) => (s.season_number > max ? s.season_number : max), 0);

  const [selection, setSelection] = useState<string>(latestSeason > 0 ? `season:${latestSeason}` : 'all');
  const userTouchedSelection = useRef(false);
  useEffect(() => {
    if (!userTouchedSelection.current && latestSeason > 0) {
      setSelection(`season:${latestSeason}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latestSeason]);

  const [highestQuality, setHighestQuality] = useState(false);
  // Assume configured until told otherwise, so the common (already-set-up) case never flickers.
  const [highestConfigured, setHighestConfigured] = useState(true);
  useEffect(() => {
    getQualityFlags().then((flags) => {
      setHighestConfigured(mediaType === 'movie' ? flags.radarrHighestConfigured : flags.sonarrHighestConfigured);
    });
  }, [mediaType]);
  const { addFavorite } = useWatchlist();

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

  async function handleClick() {
    setStatus('loading');
    setError(null);
    const isSeasonPick = selection.startsWith('season:');
    const seasonNumber = isSeasonPick ? Number(selection.split(':')[1]) : undefined;
    const monitor = isSeasonPick ? undefined : selection;
    try {
      const res = await fetch(mediaType === 'movie' ? '/api/radarr/add' : '/api/sonarr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          mediaType === 'movie'
            ? { tmdbId: id, highestQuality: effectiveHighestQuality, profileOverride: profileOverride || undefined }
            : { imdbId, title, monitor, seasonNumber, highestQuality: effectiveHighestQuality, profileOverride: profileOverride || undefined }
        ),
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

  // Neutral labels - a user shouldn't need to know what Radarr/Sonarr are to
  // add something (public-release jargon pass, UX review 2026-08-14).
  const label =
    status === 'loading' ? 'Adding…' :
    status === 'added' ? 'Added' :
    status === 'already' ? 'Already added' :
    status === 'error' ? 'Failed - retry' :
    mediaType === 'movie' ? 'Add Movie' : 'Add Show';

  if (mediaType === 'movie' && radarrMovieId) {
    return <DeleteMovieButton movieId={radarrMovieId} />;
  }

  if (mediaType === 'tv' && sonarrSeriesId) {
    return <DeleteSeriesButton seriesId={sonarrSeriesId} />;
  }

  return (
    <>
      {mediaType === 'tv' && (
        <select
          value={selection}
          onChange={(e) => { userTouchedSelection.current = true; setSelection(e.target.value); }}
          disabled={locked}
          aria-label="Which seasons to download"
          className="px-2 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 disabled:opacity-60"
        >
          {PRESET_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
          {realSeasons.length > 0 && (
            <optgroup label="Specific Season">
              {realSeasons.map((s) => (
                <option key={s.season_number} value={`season:${s.season_number}`}>
                  Season {s.season_number} ({s.episode_count} ep)
                </option>
              ))}
            </optgroup>
          )}
        </select>
      )}
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
      </div>
    </>
  );
}
