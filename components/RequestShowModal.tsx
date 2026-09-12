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
  episodes: { seasonNumber: number; episodeNumber: number; hasFile: boolean; title?: string }[];
}

interface LookupSeason {
  seasonNumber: number;
  episodeCount: number;
  airDate: string | null;
  episodes: { episodeNumber: number; title: string | null }[];
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

function formatAirDate(d: string): string {
  return new Date(`${d}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

interface AirInfo {
  firstAirDate: string | null;
  nextEpisodeAirDate: string | null;
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
  // --- season list + air-date info (TMDB) ---
  // Always fetched, even when seasons arrive via prop: the prop path carries
  // no premiere/next-episode dates, and those drive the unaired warning.
  const [fetchedSeasons, setFetchedSeasons] = useState<TmdbSeason[] | null>(null);
  const [airInfo, setAirInfo] = useState<AirInfo | null>(null);
  useEffect(() => {
    if (!open || airInfo !== null) return;
    fetch(`/api/tmdb/seasons?id=${tmdbId}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        setAirInfo({ firstAirDate: data.firstAirDate ?? null, nextEpisodeAirDate: data.nextEpisodeAirDate ?? null });
        setFetchedSeasons(((data.seasons ?? []) as TmdbSeason[]).filter((s) => s.season_number >= 0 && s.episode_count > 0));
      })
      .catch(() => setFetchedSeasons([]));
  }, [open, tmdbId, airInfo]);
  const baseSeasons = seasonsProp.length > 0 ? seasonsProp : fetchedSeasons ?? [];
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

  // Sonarr can know seasons TMDB doesn't - TVDB files a revival as more
  // seasons of the same show while TMDB splits it off (Kitchen Nightmares:
  // TMDB stops at season 6, TVDB carries 7-9). Owned shows merge in every
  // season Sonarr has episodes for; NOT-yet-added shows get TVDB's full
  // season/episode picture (counts, titles, air dates) through the same
  // lookup + metadata service Sonarr itself uses, so the initial add can
  // offer exactly what Sonarr would know after adding.
  const [lookupSeasons, setLookupSeasons] = useState<LookupSeason[] | null>(null);
  useEffect(() => {
    if (!open || statePending || owned || lookupSeasons !== null) return;
    fetch(`/api/sonarr/season-preview?title=${encodeURIComponent(title)}${imdbId ? `&imdbId=${encodeURIComponent(imdbId)}` : ''}${tmdbId ? `&tmdbId=${tmdbId}` : ''}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setLookupSeasons(Array.isArray(data.seasons) ? data.seasons : []))
      .catch(() => setLookupSeasons([]));
  }, [open, statePending, owned, lookupSeasons, title, imdbId, tmdbId]);
  const lookupBySeason = new Map<number, LookupSeason>();
  for (const ls of lookupSeasons ?? []) lookupBySeason.set(ls.seasonNumber, ls);

  const sonarrSeasonTotals = new Map<number, number>();
  for (const e of sonarrState?.episodes ?? []) {
    sonarrSeasonTotals.set(e.seasonNumber, (sonarrSeasonTotals.get(e.seasonNumber) ?? 0) + 1);
  }
  for (const ls of lookupSeasons ?? []) {
    if (!sonarrSeasonTotals.has(ls.seasonNumber)) sonarrSeasonTotals.set(ls.seasonNumber, ls.episodeCount);
  }
  const extraSeasons: TmdbSeason[] = Array.from(sonarrSeasonTotals.entries())
    .filter(([n]) => !baseSeasons.some((s) => s.season_number === n))
    .map(([n, count]) => ({
      season_number: n,
      name: n === 0 ? 'Specials' : `Season ${n}`,
      episode_count: count,
      air_date: lookupBySeason.get(n)?.airDate ?? null,
    }));
  const seasons =
    extraSeasons.length > 0 ? [...baseSeasons, ...extraSeasons].sort((a, b) => a.season_number - b.season_number) : baseSeasons;

  // Aired-yet check. Season air_date is the season's first episode, so a
  // future/missing date on every season means nothing has aired at all;
  // a scheduled next episode or a future season means some of what's
  // selectable here doesn't exist yet.
  const today = new Date().toISOString().slice(0, 10);
  const nothingAired =
    airInfo !== null &&
    (!airInfo.firstAirDate || airInfo.firstAirDate > today) &&
    !seasons.some((s) => s.air_date != null && s.air_date <= today);
  const someUnaired =
    airInfo !== null && !nothingAired && (airInfo.nextEpisodeAirDate !== null || seasons.some((s) => s.air_date != null && s.air_date > today));

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

  // --- big-add warning ---
  // Threshold comes from Settings (EPISODE_WARN_COUNT, 0 = off), fetched per
  // open so a Settings change applies to the very next add. Fetch failure
  // falls back to 0 so a hiccup can never block adding.
  const [warnThreshold, setWarnThreshold] = useState<number | null>(null);
  useEffect(() => {
    if (!open || warnThreshold !== null) return;
    fetch('/api/settings/episode-warn', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => setWarnThreshold(Number(data.count) || 0))
      .catch(() => setWarnThreshold(0));
  }, [open, warnThreshold]);

  // The warning fires WHILE selecting, the moment the running count crosses
  // the threshold - not on the Add click. 'live' mode just asks "sure?";
  // 'submit' mode is a backstop for reaching Add without ever touching the
  // picker (the preselected latest season can already be over the line) and
  // its confirm button submits. "That's fine" arms `acknowledged` so the
  // popup stays quiet for the rest of this selection; dropping back under
  // the threshold re-arms it. `warnedAt` keeps "Go back" from re-popping
  // the modal until the count actually changes again.
  const [warnMode, setWarnMode] = useState<'live' | 'submit' | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [warnedAt, setWarnedAt] = useState<number | null>(null);

  // Episodes this selection would actually download: cherry-picks plus, per ticked season, its episodes minus what's already owned.
  let totalSelected = episodePicks.size;
  for (const n of Array.from(fullSeasons)) {
    const s = seasons.find((x) => x.season_number === n);
    if (s) totalSelected += Math.max(0, s.episode_count - (ownedCountBySeason.get(n) ?? 0));
  }

  useEffect(() => {
    if (!open) {
      setWarnMode(null);
      setAcknowledged(false);
      setWarnedAt(null);
      return;
    }
    if (!warnThreshold || !touched) return;
    if (totalSelected < warnThreshold) {
      setAcknowledged(false);
      setWarnedAt(null);
      return;
    }
    if (!acknowledged && warnedAt !== totalSelected && warnMode === null) {
      setWarnMode('live');
      setWarnedAt(totalSelected);
    }
  }, [open, warnThreshold, touched, totalSelected, acknowledged, warnedAt, warnMode]);

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

  function handleSubmitClick() {
    if (warnThreshold && totalSelected >= warnThreshold && !acknowledged) {
      setWarnMode('submit');
      setWarnedAt(totalSelected);
      return;
    }
    void handleSubmit();
  }

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
              tmdbId,
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
    <>
    <Modal
      open={open}
      onClose={() => {
        // While the big-add warning is up, Escape/outside-click peels off
        // just that layer instead of abandoning the whole selection.
        if (warnMode !== null) setWarnMode(null);
        else onClose();
      }}
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
            onClick={handleSubmitClick}
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
        {nothingAired && (
          <div className="rounded-lg bg-amber-500/10 ring-1 ring-amber-500/30 px-3 py-2 text-sm text-amber-300">
            This show hasn&apos;t premiered yet, so no episodes have aired.{' '}
            {airInfo?.firstAirDate ? `The first episode airs ${formatAirDate(airInfo.firstAirDate)}.` : 'No air date has been announced.'}{' '}
            You can still add it, and episodes will download once they air.
          </div>
        )}
        {!owned && someUnaired && (
          <div className="rounded-lg bg-zinc-800/60 ring-1 ring-white/5 px-3 py-2 text-xs text-zinc-400">
            Some episodes haven&apos;t aired yet.
            {airInfo?.nextEpisodeAirDate ? ` The next one airs ${formatAirDate(airInfo.nextEpisodeAirDate)}.` : ''} Anything unaired will download once it airs.
          </div>
        )}
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
            {/* Above the season list on purpose - below a long scrollable
                list it was invisible enough that its existence got reported
                as a missing feature. */}
            <label className="flex items-center gap-2 text-sm text-zinc-300 cursor-pointer select-none touch:py-1">
              <input
                type="checkbox"
                checked={monitorFuture}
                onChange={(e) => {
                  setTouched(true);
                  setMonitorFuture(e.target.checked);
                }}
                className="accent-amber-400 touch:w-5 touch:h-5"
              />
              Also grab future episodes as they air
            </label>
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Seasons</h4>
              {owned && <span className="text-xs text-zinc-500">already-downloaded items are locked</span>}
            </div>
            <div className="rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800/60 max-h-72 overflow-y-auto">
              {(() => {
                const selectable = seasons.filter((s) => !isSeasonFullyOwned(s)).map((s) => s.season_number);
                const allChecked = selectable.length > 0 && selectable.every((n) => fullSeasons.has(n));
                return (
                  <div className="flex items-center gap-2 px-3 py-2 touch:py-3 text-sm bg-zinc-800/40">
                    <span className="w-5 touch:w-9" />
                    <label className="flex items-center gap-3 flex-1 cursor-pointer font-medium">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={() => {
                          setTouched(true);
                          setFullSeasons(allChecked ? new Set() : new Set(selectable));
                          setEpisodePicks(new Set());
                        }}
                        className="accent-amber-400 touch:w-5 touch:h-5"
                      />
                      <span className="flex-1">All seasons</span>
                    </label>
                  </div>
                );
              })()}
              {seasons.map((s) => {
                const n = s.season_number;
                const fullyOwned = isSeasonFullyOwned(s);
                const ownedCount = ownedCountBySeason.get(n) ?? 0;
                const picked = picksBySeason.get(n) ?? 0;
                const eps = seasonEpisodes.get(n);
                return (
                  <div key={n}>
                    <div className="flex items-center gap-2 px-3 py-2 touch:py-3 text-sm hover:bg-zinc-800/50">
                      <button
                        onClick={() => toggleExpand(n)}
                        aria-label={`${expanded.has(n) ? 'Collapse' : 'Expand'} ${n === 0 ? 'specials' : `season ${n}`} episodes`}
                        className="w-5 touch:w-9 touch:h-9 touch:-my-1 flex items-center justify-center text-zinc-500 hover:text-zinc-200 touch:text-base"
                      >
                        <span className={`inline-block transition-transform ${expanded.has(n) ? 'rotate-90' : ''}`}>▸</span>
                      </button>
                      <label className={`flex items-center gap-3 flex-1 ${fullyOwned ? 'opacity-60' : 'cursor-pointer'}`}>
                        <input
                          type="checkbox"
                          checked={fullyOwned || fullSeasons.has(n)}
                          disabled={fullyOwned}
                          onChange={() => toggleSeason(n)}
                          className="accent-amber-400 touch:w-5 touch:h-5"
                        />
                        <span className="flex-1">{n === 0 ? 'Specials' : `Season ${n}`}</span>
                        {fullyOwned ? (
                          <span className="text-xs text-green-400 font-medium">In library</span>
                        ) : picked > 0 ? (
                          <span className="text-xs text-amber-400 font-medium">{picked} picked</span>
                        ) : ownedCount > 0 ? (
                          <span className="text-xs text-zinc-500">{ownedCount}/{s.episode_count} owned</span>
                        ) : s.air_date && s.air_date > today ? (
                          <span className="text-xs text-amber-400/80">Airs {formatAirDate(s.air_date)}</span>
                        ) : (
                          <span className="text-xs text-zinc-500">{s.episode_count > 0 ? `${s.episode_count} ep` : '? ep'}</span>
                        )}
                      </label>
                    </div>
                    {expanded.has(n) && (
                      <div className="pl-10 pr-3 pb-2">
                        {eps === 'loading' || eps === undefined ? (
                          <div className="h-6 bg-zinc-800 rounded animate-pulse my-1" />
                        ) : (
                          // TMDB has no episode list for a season it doesn't know about - fall back to Sonarr's own episodes for owned shows, or the TVDB lookup preview for un-added ones. Only if all three are empty does the note render.
                          (() => {
                            const sonarrEps = (sonarrState?.episodes ?? [])
                              .filter((se) => se.seasonNumber === n)
                              .sort((a, b) => a.episodeNumber - b.episodeNumber)
                              .map((se) => ({ episode_number: se.episodeNumber, name: se.title ?? `Episode ${se.episodeNumber}` }));
                            const lookupEps = (lookupBySeason.get(n)?.episodes ?? []).map((le) => ({
                              episode_number: le.episodeNumber,
                              name: le.title ?? `Episode ${le.episodeNumber}`,
                            }));
                            const shown = eps.length > 0 ? eps : sonarrEps.length > 0 ? sonarrEps : lookupEps;
                            if (shown.length === 0) {
                              return <p className="text-xs text-zinc-500 py-1">Episode list shows up once the show is added. Ticking the season grabs all of it.</p>;
                            }
                            return shown.map((e) => {
                            const key = epKey(n, e.episode_number);
                            const has = ownedEpisodes.has(key);
                            const seasonTicked = fullSeasons.has(n) && !fullyOwned;
                            return (
                              <label
                                key={e.episode_number}
                                className={`flex items-center gap-2.5 py-1 touch:py-2 text-xs ${has ? 'opacity-60' : 'cursor-pointer'}`}
                              >
                                <input
                                  type="checkbox"
                                  checked={has || seasonTicked || episodePicks.has(key)}
                                  disabled={has || seasonTicked}
                                  onChange={() => toggleEpisode(n, e.episode_number)}
                                  className="accent-amber-400 touch:w-5 touch:h-5"
                                />
                                <span className="text-zinc-500 w-8">E{e.episode_number}</span>
                                <span className={`flex-1 truncate ${has ? 'text-zinc-500' : 'text-zinc-300'}`}>{e.name}</span>
                                {has && <span className="text-green-400 font-medium whitespace-nowrap">In library</span>}
                              </label>
                            );
                            });
                          })()
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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

        {error && (
          <div className="rounded-lg bg-red-500/10 ring-1 ring-red-500/30 px-3 py-2 text-sm">
            <p className="font-medium text-red-300">{owned ? "Couldn't update the show" : "Couldn't add the show"}</p>
            <p className="text-red-300/80 mt-0.5">{error}</p>
          </div>
        )}
      </div>
    </Modal>
    <Modal
      open={warnMode !== null}
      onClose={() => setWarnMode(null)}
      title="That's a lot of episodes"
      footer={
        <>
          <button
            onClick={() => setWarnMode(null)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Go back
          </button>
          <button
            onClick={() => {
              setAcknowledged(true);
              const submitNow = warnMode === 'submit';
              setWarnMode(null);
              if (submitNow) void handleSubmit();
            }}
            className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400"
          >
            {warnMode === 'submit' ? 'Add them all' : "That's fine"}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <p className="text-sm text-zinc-300">
          Your selection is up to <span className="font-semibold text-amber-400">{totalSelected} episodes</span> to download. That can
          tie up the download queue and eat disk space for quite a while.
        </p>
        <p className="text-xs text-zinc-500">
          This warning triggers at {warnThreshold} episodes. You can change that number or turn it off in Settings under App Config.
        </p>
      </div>
    </Modal>
    </>
  );
}
