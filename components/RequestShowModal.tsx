'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import type { TmdbSeason } from '@/types';

interface QualityProfileOption {
  id: number;
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  imdbId: string | null;
  /** Real, numbered seasons (no Specials). Empty = the modal fetches them itself when tmdbId is given, else falls back to adding all seasons. */
  seasons: TmdbSeason[];
  /** Lets the modal fetch the season list itself - card callers don't have it on hand. */
  tmdbId?: number;
  /** Whether Settings has a Highest Quality profile configured - gates that toggle. */
  highestConfigured: boolean;
  onSuccess: (alreadyAdded: boolean) => void;
}

/**
 * Seerr-style request sheet for shows: pick any combination of seasons
 * (checkboxes - the old inline <select> could only pick one), optionally
 * monitor future seasons, and set quality, all in one gathered decision.
 * Movies deliberately skip this - nothing to choose there.
 */
export default function RequestShowModal({ open, onClose, title, imdbId, seasons: seasonsProp, tmdbId, highestConfigured, onSuccess }: Props) {
  // Card callers pass tmdbId instead of a season list - fetch it on first open.
  const [fetchedSeasons, setFetchedSeasons] = useState<TmdbSeason[] | null>(null);
  useEffect(() => {
    if (!open || seasonsProp.length > 0 || !tmdbId || fetchedSeasons !== null) return;
    fetch(`/api/tmdb/seasons?id=${tmdbId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setFetchedSeasons(((data.seasons ?? []) as TmdbSeason[]).filter((s) => s.season_number > 0 && s.episode_count > 0)))
      .catch(() => setFetchedSeasons([]));
  }, [open, seasonsProp.length, tmdbId, fetchedSeasons]);

  const seasons = seasonsProp.length > 0 ? seasonsProp : fetchedSeasons ?? [];
  const seasonsPending = seasonsProp.length === 0 && Boolean(tmdbId) && fetchedSeasons === null;
  const latestSeason = seasons.reduce((max, s) => (s.season_number > max ? s.season_number : max), 0);
  const [checked, setChecked] = useState<Set<number>>(new Set(latestSeason > 0 ? [latestSeason] : []));
  const [monitorFuture, setMonitorFuture] = useState(false);
  const [highestQuality, setHighestQuality] = useState(false);
  const [profiles, setProfiles] = useState<QualityProfileOption[] | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [profileOverride, setProfileOverride] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Season list can arrive after mount (card callers fetch it lazily) - keep
  // defaulting to the latest season until the user actually touches a box.
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched && latestSeason > 0) setChecked(new Set([latestSeason]));
  }, [latestSeason, touched]);

  // Profiles load once, the first time the modal opens.
  useEffect(() => {
    if (!open || profiles !== null || profilesError) return;
    fetch('/api/sonarr/profiles', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setProfilesError(data.error);
        else setProfiles(data.profiles);
      })
      .catch((err) => setProfilesError(err instanceof Error ? err.message : String(err)));
  }, [open, profiles, profilesError]);

  function toggleSeason(n: number) {
    setTouched(true);
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
  }

  function setAll(on: boolean) {
    setTouched(true);
    setChecked(on ? new Set(seasons.map((s) => s.season_number)) : new Set());
  }

  const nothingSelected = seasons.length > 0 && checked.size === 0 && !monitorFuture;

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const body =
        seasons.length === 0
          ? { imdbId, title, monitor: 'all', highestQuality: highestQuality && highestConfigured, profileOverride: profileOverride || undefined }
          : {
              imdbId,
              title,
              seasonNumbers: Array.from(checked).sort((a, b) => a - b),
              monitorFuture,
              highestQuality: highestQuality && highestConfigured,
              profileOverride: profileOverride || undefined,
            };
      const res = await fetch('/api/sonarr/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      onSuccess(Boolean(data.alreadyAdded));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Add "${title}"`}
      footer={
        <>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || nothingSelected || seasonsPending}
            title={nothingSelected ? 'Pick at least one season (or future seasons)' : undefined}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
          >
            {submitting ? 'Adding…' : 'Add Show'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {seasonsPending ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />
            ))}
          </div>
        ) : seasons.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Season list unavailable for this show - all seasons will be added and monitored.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Seasons</h4>
              <div className="flex gap-3 text-xs">
                <button onClick={() => setAll(true)} className="text-amber-400 hover:text-amber-300 font-medium">
                  All
                </button>
                <button onClick={() => setAll(false)} className="text-zinc-400 hover:text-zinc-200 font-medium">
                  None
                </button>
              </div>
            </div>
            <div className="rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800/60 max-h-56 overflow-y-auto">
              {seasons.map((s) => (
                <label
                  key={s.season_number}
                  className="flex items-center gap-3 px-3 py-2 text-sm cursor-pointer hover:bg-zinc-800/50"
                >
                  <input
                    type="checkbox"
                    checked={checked.has(s.season_number)}
                    onChange={() => toggleSeason(s.season_number)}
                    className="accent-amber-400"
                  />
                  <span className="flex-1">Season {s.season_number}</span>
                  <span className="text-xs text-zinc-500">{s.episode_count} ep</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={monitorFuture}
                onChange={(e) => setMonitorFuture(e.target.checked)}
                className="accent-amber-400"
              />
              Also grab future seasons as they air
            </label>
          </div>
        )}

        <div className="space-y-2">
          <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Quality</h4>
          <label
            className={`flex items-center gap-2 text-sm select-none ${
              profileOverride || !highestConfigured ? 'text-zinc-600' : 'text-zinc-300 cursor-pointer'
            }`}
            title={!highestConfigured ? 'Set a Highest Quality Profile in Settings to use this' : undefined}
          >
            <input
              type="checkbox"
              checked={highestQuality && highestConfigured}
              onChange={(e) => setHighestQuality(e.target.checked)}
              disabled={Boolean(profileOverride) || !highestConfigured}
              className="accent-amber-400"
            />
            Download highest quality
          </label>
          {profilesError ? (
            <p className="text-xs text-red-400">{profilesError}</p>
          ) : (
            <select
              value={profileOverride}
              onChange={(e) => setProfileOverride(e.target.value)}
              disabled={profiles === null}
              aria-label="Override quality profile for this request"
              className="w-full px-2 py-1.5 rounded-lg text-sm bg-zinc-800 text-zinc-300 border border-zinc-700 disabled:opacity-60"
            >
              <option value="">{profiles === null ? 'Loading profiles…' : 'Default profile'}</option>
              {profiles?.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
