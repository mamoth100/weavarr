'use client';

import { useEffect, useState } from 'react';
import Modal from '@/components/Modal';
import type { TmdbSeason } from '@/types';
import { refreshDownloadProgressSoon } from '@/hooks/useDownloadProgress';

interface QualityProfileOption {
  id: number;
  name: string;
}

interface TmdbSeasonEpisode {
  episode_number: number;
  name: string;
}

interface SonarrState {
  seriesId: number | null;
  monitorFuture: boolean;
  episodes: { seasonNumber: number; episodeNumber: number; hasFile: boolean }[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  imdbId: string | null;
  /** Real, numbered seasons (no Specials). Empty = the modal fetches them itself via tmdbId. */
  seasons: TmdbSeason[];
  /** Required: keys the Sonarr-state lookup, season self-fetch, and episode expansion. */
  tmdbId: number;
  /** Whether Settings has a Highest Quality profile configured - gates that toggle (new adds only). */
  highestConfigured: boolean;
  onSuccess: (alreadyAdded: boolean) => void;
}

function epKey(seasonNumber: number, episodeNumber: number): string {
  return `${seasonNumber}:${episodeNumber}`;
}

/**
 * The one request surface for shows, at any point in their life:
 * - not added yet: pick whole seasons (checkbox) or expand a season
 *   (triangle) and cherry-pick episodes; quality options included.
 * - already added ("get more"): same picker, but everything you already
 *   have renders locked - re-downloading is impossible by construction -
 *   and the future-seasons toggle edits the live setting.
 * Owned state comes from Sonarr, season/episode lists from TMDB, episodes
 * lazy-loaded per season so thirty-season shows stay instant.
 */
export default function RequestShowModal({ open, onClose, title, imdbId, seasons: seasonsProp, tmdbId, highestConfigured, onSuccess }: Props) {
  // --- season list (TMDB) ---
  const [fetchedSeasons, setFetchedSeasons] = useState<TmdbSeason[] | null>(null);
  useEffect(() => {
    if (!open || seasonsProp.length > 0 || fetchedSeasons !== null) return;
    fetch(`/api/tmdb/seasons?id=${tmdbId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setFetchedSeasons(((data.seasons ?? []) as TmdbSeason[]).filter((s) => s.season_number > 0 && s.episode_count > 0)))
      .catch(() => setFetchedSeasons([]));
  }, [open, seasonsProp.length, tmdbId, fetchedSeasons]);
  const seasons = seasonsProp.length > 0 ? seasonsProp : fetchedSeasons ?? [];
  const seasonsPending = seasonsProp.length === 0 && fetchedSeasons === null;

  // --- what Sonarr already has ---
  const [sonarrState, setSonarrState] = useState<SonarrState | null>(null);
  useEffect(() => {
    if (!open || sonarrState !== null) return;
    fetch(`/api/sonarr/series-state?tmdbId=${tmdbId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setSonarrState(data);
        setMonitorFuture(Boolean(data.monitorFuture));
      })
      .catch(() => setSonarrState({ seriesId: null, monitorFuture: false, episodes: [] }));
  }, [open, tmdbId, sonarrState]);
  const owned = Boolean(sonarrState?.seriesId);
  const statePending = sonarrState === null;

  // owned lookup structures
  const ownedEpisodes = new Set((sonarrState?.episodes ?? []).filter((e) => e.hasFile).map((e) => epKey(e.seasonNumber, e.episodeNumber)));
  const ownedCountBySeason = new Map<number, number>();
  for (const e of sonarrState?.episodes ?? []) {
    if (e.hasFile) ownedCountBySeason.set(e.seasonNumber, (ownedCountBySeason.get(e.seasonNumber) ?? 0) + 1);
  }

  // --- selection state ---
  const [fullSeasons, setFullSeasons] = useState<Set<number>>(new Set());
  const [episodePicks, setEpisodePicks] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [seasonEpisodes, setSeasonEpisodes] = useState<Map<number, TmdbSeasonEpisode[] | 'loading'>>(new Map());
  const [monitorFuture, setMonitorFuture] = useState(false);
  const [touched, setTouched] = useState(false);

  // Default for NEW shows: latest season preselected (existing behavior).
  // Owned shows start with nothing selected - selections are additions.
  const latestSeason = seasons.reduce((max, s) => (s.season_number > max ? s.season_number : max), 0);
  useEffect(() => {
    if (touched || statePending || owned || latestSeason === 0) return;
    setFullSeasons(new Set([latestSeason]));
  }, [latestSeason, touched, statePending, owned]);

  // --- quality (new adds only) ---
  const [highestQuality, setHighestQuality] = useState(false);
  const [profiles, setProfiles] = useState<QualityProfileOption[] | null>(null);
  const [profilesError, setProfilesError] = useState<string | null>(null);
  const [profileOverride, setProfileOverride] = useState('');
  useEffect(() => {
    if (!open || owned || statePending || profiles !== null || profilesError) return;
    fetch('/api/sonarr/profiles', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setProfilesError(data.error);
        else setProfiles(data.profiles);
      })
      .catch((err) => setProfilesError(err instanceof Error ? err.message : String(err)));
  }, [open, owned, statePending, profiles, profilesError]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function isSeasonFullyOwned(s: TmdbSeason): boolean {
    return (ownedCountBySeason.get(s.season_number) ?? 0) >= s.episode_count && s.episode_count > 0;
  }

  function toggleSeason(n: number) {
    setTouched(true);
    setFullSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
    // a whole-season tick supersedes any cherry-picks inside it
    setEpisodePicks((prev) => {
      const next = new Set(Array.from(prev).filter((k) => !k.startsWith(`${n}:`)));
      return next;
    });
  }

  function toggleExpand(n: number) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n);
      else next.add(n);
      return next;
    });
    if (!seasonEpisodes.has(n)) {
      setSeasonEpisodes((prev) => new Map(prev).set(n, 'loading'));
      fetch(`/api/tmdb/season-episodes?id=${tmdbId}&season=${n}`, { cache: 'no-store' })
        .then((res) => res.json())
        .then((data) => setSeasonEpisodes((prev) => new Map(prev).set(n, (data.episodes ?? []) as TmdbSeasonEpisode[])))
        .catch(() => setSeasonEpisodes((prev) => new Map(prev).set(n, [])));
    }
  }

  function toggleEpisode(seasonNumber: number, episodeNumber: number) {
    setTouched(true);
    const key = epKey(seasonNumber, episodeNumber);
    setEpisodePicks((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // cherry-picking demotes a whole-season tick to just the picks
    setFullSeasons((prev) => {
      if (!prev.has(seasonNumber)) return prev;
      const next = new Set(prev);
      next.delete(seasonNumber);
      return next;
    });
  }

  const picksBySeason = new Map<number, number>();
  for (const k of Array.from(episodePicks)) {
    const s = Number(k.split(':')[0]);
    picksBySeason.set(s, (picksBySeason.get(s) ?? 0) + 1);
  }

  const futureChanged = owned && sonarrState !== null && monitorFuture !== sonarrState.monitorFuture;
  const nothingSelected = fullSeasons.size === 0 && episodePicks.size === 0 && !(owned ? futureChanged : monitorFuture);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    const picks = Array.from(episodePicks).map((k) => {
      const [s, e] = k.split(':').map(Number);
      return { seasonNumber: s, episodeNumber: e };
    });
    try {
      const res = owned
        ? await fetch('/api/sonarr/expand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              seriesId: sonarrState!.seriesId,
              seasonNumbers: Array.from(fullSeasons).sort((a, b) => a - b),
              episodePicks: picks,
              ...(futureChanged ? { monitorFuture } : {}),
            }),
          })
        : await fetch('/api/sonarr/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              imdbId,
              title,
              seasonNumbers: Array.from(fullSeasons).sort((a, b) => a - b),
              episodePicks: picks,
              monitorFuture,
              highestQuality: highestQuality && highestConfigured,
              profileOverride: profileOverride || undefined,
            }),
          });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Request failed');
      refreshDownloadProgressSoon();
      onSuccess(Boolean(data.alreadyAdded));
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  const pending = seasonsPending || statePending;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={owned ? `Get more of "${title}"` : `Add "${title}"`}
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
            disabled={submitting || nothingSelected || pending}
            title={nothingSelected ? 'Pick seasons or episodes (or change the future-seasons setting)' : undefined}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40"
          >
            {submitting ? 'Working…' : owned ? 'Update Show' : 'Add Show'}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {pending ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />
            ))}
          </div>
        ) : seasons.length === 0 ? (
          <p className="text-sm text-zinc-400">
            Season list unavailable for this show{owned ? '.' : ' - all seasons will be added and monitored.'}
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Seasons</h4>
              {owned && <span className="text-xs text-zinc-500">already-downloaded items are locked</span>}
            </div>
            <div className="rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
              {seasons.map((s) => {
                const n = s.season_number;
                const fullyOwned = isSeasonFullyOwned(s);
                const ownedCount = ownedCountBySeason.get(n) ?? 0;
                const picked = picksBySeason.get(n) ?? 0;
                const eps = seasonEpisodes.get(n);
                return (
                  <div key={n}>
                    <div className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-zinc-800/50">
                      <button
                        onClick={() => toggleExpand(n)}
                        aria-label={`${expanded.has(n) ? 'Collapse' : 'Expand'} season ${n} episodes`}
                        className="w-5 text-zinc-500 hover:text-zinc-200"
                      >
                        <span className={`inline-block transition-transform ${expanded.has(n) ? 'rotate-90' : ''}`}>▸</span>
                      </button>
                      <label className={`flex items-center gap-3 flex-1 ${fullyOwned ? 'opacity-60' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={fullyOwned || fullSeasons.has(n)}
                          disabled={fullyOwned}
                          onChange={() => toggleSeason(n)}
                          className="accent-amber-400"
                        />
                        <span className="flex-1">Season {n}</span>
                        {fullyOwned ? (
                          <span className="text-xs text-green-400 font-medium">In library</span>
                        ) : picked > 0 ? (
                          <span className="text-xs text-amber-400 font-medium">{picked} picked</span>
                        ) : ownedCount > 0 ? (
                          <span className="text-xs text-zinc-500">{ownedCount}/{s.episode_count} owned</span>
                        ) : (
                          <span className="text-xs text-zinc-500">{s.episode_count} ep</span>
                        )}
                      </label>
                    </div>
                    {expanded.has(n) && (
                      <div className="pl-10 pr-3 pb-2">
                        {eps === 'loading' || eps === undefined ? (
                          <div className="h-6 bg-zinc-800 rounded animate-pulse my-1" />
                        ) : (
                          eps.map((e) => {
                            const key = epKey(n, e.episode_number);
                            const has = ownedEpisodes.has(key);
                            const seasonTicked = fullSeasons.has(n) && !fullyOwned;
                            return (
                              <label
                                key={e.episode_number}
                                className={`flex items-center gap-2.5 py-1 text-xs ${has ? 'opacity-60' : 'cursor-pointer'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={has || seasonTicked || episodePicks.has(key)}
                                  disabled={has || seasonTicked}
                                  onChange={() => toggleEpisode(n, e.episode_number)}
                                  className="accent-amber-400"
                                />
                                <span className="text-zinc-500 w-8">E{e.episode_number}</span>
                                <span className={`flex-1 truncate ${has ? 'text-zinc-500' : 'text-zinc-300'}`}>{e.name}</span>
                                {has && <span className="text-green-400 font-medium whitespace-nowrap">In library</span>}
                              </label>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={monitorFuture}
                onChange={(e) => {
                  setTouched(true);
                  setMonitorFuture(e.target.checked);
                }}
                className="accent-amber-400"
              />
              Also grab future episodes as they air
            </label>
          </div>
        )}

        {!owned && !pending && (
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
        )}

        {error && <p className="text-sm text-red-400">{error}</p>}
      </div>
    </Modal>
  );
}
