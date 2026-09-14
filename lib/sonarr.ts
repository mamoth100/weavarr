import { fetchWithTimeout } from './fetchTimeout';
import { pickQualityProfile } from './qualityProfile';
import { trackedStatePriority } from './queuePriority';
import { deleteCachedPoster } from './posterCache';
import { notifyAllChannels } from './notificationChannels';
import { findTvIdByTvdbId, findTvIdByImdbId, getTvExternalIds } from './tmdb';
import { recordRequest } from './requestLedger';
import { readableApiError } from './httpError';

// Enable defaults on (unset !== 'false') - Sonarr is core to this app and
// was configurable long before this toggle existed, so an unset env var
// must keep meaning "on" for every existing setup. Blanking both URL and
// key when disabled means every existing `if (!SONARR_URL...)` check
// throughout this file already treats "disabled" the same as "not
// configured" for free, with no changes needed at each call site.
const SONARR_ENABLED = process.env.ENABLE_SONARR !== 'false';
// Stripped of any trailing slash - see the same fix in lib/plex.ts for why.
const SONARR_URL = SONARR_ENABLED ? process.env.SONARR_URL?.replace(/\/$/, '') : undefined;
const SONARR_KEY = SONARR_ENABLED ? process.env.SONARR_KEY : undefined;
const SONARR_DEFAULT_PROFILE = process.env.SONARR_DEFAULT_PROFILE || null;
const SONARR_HIGHEST_PROFILE = process.env.SONARR_HIGHEST_PROFILE || null;

function headers() {
  return { 'X-Api-Key': SONARR_KEY as string, 'Content-Type': 'application/json' };
}

/** The Sonarr quality profiles available to pick from - used by the advanced per-request override in RequestButton. */
export async function getSonarrQualityProfiles(): Promise<{ id: number; name: string }[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sonarr quality profile list failed: ${res.status}`);
  return res.json();
}

export async function addSeriesToSonarr({
  imdbId,
  title,
  monitor = 'all',
  seasonNumber,
  seasonNumbers,
  episodePicks,
  monitorFuture = false,
  highestQuality = false,
  profileOverride,
  source = 'app',
  tmdbId,
  unaired = false,
}: {
  imdbId: string | null;
  title: string;
  /** TMDB id when the caller has one - resolved to TVDB/IMDB ids so the lookup targets the exact series, not a title guess. */
  tmdbId?: number | null;
  /** Monitor every episode on the schedule that hasn't aired yet, in any season - no season pick needed. Combines with picks. */
  unaired?: boolean;
  monitor?: string;
  seasonNumber?: number;
  /** Multiple hand-picked seasons (request modal). Wins over seasonNumber and the monitor preset. */
  seasonNumbers?: number[];
  /** Hand-picked individual episodes (request modal's expanded rows) - monitored and searched after the add. */
  episodePicks?: { seasonNumber: number; episodeNumber: number }[];
  /** With seasonNumbers: also monitor seasons that don't exist yet (Sonarr's monitorNewItems). */
  monitorFuture?: boolean;
  highestQuality?: boolean;
  /** An exact profile name that wins over the Settings default/highest pick for this one request. */
  profileOverride?: string | null;
  /** Request-ledger attribution: 'app' (human click) or 'watchlist' (auto-add). */
  source?: 'app' | 'watchlist';
}) {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');

  const series = await lookupSonarrSeriesForAdd(imdbId ?? null, title, tmdbId ?? null);
  if (!series) throw new Error('No matching series found in Sonarr');

  if (series.id) return { alreadyAdded: true };

  const [profilesRes, foldersRes] = await Promise.all([
    fetchWithTimeout(`${SONARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' }),
    fetchWithTimeout(`${SONARR_URL}/api/v3/rootfolder`, { headers: headers(), cache: 'no-store' }),
  ]);
  const profiles = await profilesRes.json();
  const folders = await foldersRes.json();
  if (!profiles?.length) throw new Error('Sonarr has no quality profile configured');
  if (!folders?.length) throw new Error('Sonarr has no root folder configured');

  const preferredName = profileOverride || (highestQuality ? SONARR_HIGHEST_PROFILE : SONARR_DEFAULT_PROFILE);
  const profile = pickQualityProfile(profiles, preferredName);
  if (preferredName && profile.name.toLowerCase() !== preferredName.trim().toLowerCase()) {
    notifyAllChannels(
      'Quality profile mismatch',
      `Sonarr has no profile named "${preferredName}" - "${series.title}" was added using "${profile.name}" instead.`,
      'alert'
    ).catch(() => {});
  }

  // Hand-picked seasons win over the preset monitor strategy: set per-season
  // monitored flags and leave addOptions.monitor out so Sonarr doesn't
  // overwrite that choice. seasonNumbers (request modal, any combination)
  // supersedes the older single seasonNumber, kept for existing callers.
  const picked = seasonNumbers ?? (seasonNumber !== undefined ? [seasonNumber] : null);
  const hasEpisodePicks = Boolean(episodePicks && episodePicks.length > 0);
  // Episode picks (or an unaired-only request) force the hand-picked path
  // even with zero full seasons - the preset path would monitor everything.
  const pickedSet = picked ? new Set(picked) : hasEpisodePicks || unaired ? new Set<number>() : null;
  const seasons = pickedSet
    ? (series.seasons as { seasonNumber: number }[]).map((s) => ({ ...s, monitored: pickedSet.has(s.seasonNumber) }))
    : series.seasons;

  const addRes = await fetchWithTimeout(`${SONARR_URL}/api/v3/series`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      ...series,
      seasons,
      qualityProfileId: profile.id,
      rootFolderPath: folders[0].path,
      monitored: true,
      // monitorNewItems controls whether seasons that don't exist yet get
      // monitored when Sonarr discovers them - the modal's "future seasons"
      // toggle. Preset path keeps Sonarr's default behavior.
      ...(pickedSet ? { monitorNewItems: monitorFuture ? 'all' : 'none' } : {}),
      addOptions: pickedSet
        ? { searchForMissingEpisodes: true }
        : { monitor, searchForMissingEpisodes: monitor !== 'future' },
    }),
  });
  if (!addRes.ok) throw new Error(await readableApiError(addRes, 'Sonarr add failed'));
  const added = await addRes.json();

  // Hand-picked episodes: Sonarr populates a new series' episode records
  // asynchronously after the add, so poll briefly, then monitor + search
  // exactly those episodes.
  if ((hasEpisodePicks || unaired) && added?.id) {
    const wanted = new Set((episodePicks ?? []).map((p) => `${p.seasonNumber}:${p.episodeNumber}`));
    for (let attempt = 0; attempt < 8; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      const episodes = await getSonarrSeriesEpisodes(added.id).catch(() => []);
      if (episodes.length === 0) continue;
      const ids = episodes.filter((e) => wanted.has(`${e.seasonNumber}:${e.episodeNumber}`)).map((e) => e.id);
      if (ids.length > 0) {
        await monitorSonarrEpisodes(ids, true);
        await triggerSonarrEpisodeSearch(ids);
      }
      // Unaired episodes only get monitored - there is nothing to search for
      // until they air, and Sonarr's own feed picks them up then.
      if (unaired) {
        const unairedIds = episodes.filter(isSonarrEpisodeUnaired).map((e) => e.id);
        if (unairedIds.length > 0) await monitorSonarrEpisodes(unairedIds, true);
      }
      break;
    }
  }

  // The permanent request ledger - never let a bookkeeping failure break the add itself.
  try {
    const posterUrl =
      (series.images as { coverType?: string; remoteUrl?: string }[] | undefined)?.find((i) => i.coverType === 'poster')?.remoteUrl ?? null;
    const episodeSummary = hasEpisodePicks
      ? episodePicks!.map((p) => `S${p.seasonNumber}E${p.episodeNumber}`)
      : [];
    recordRequest({
      tmdbId: typeof series.tmdbId === 'number' && series.tmdbId > 0 ? series.tmdbId : null,
      tvdbId: typeof series.tvdbId === 'number' && series.tvdbId > 0 ? series.tvdbId : null,
      mediaType: 'tv',
      title: typeof series.title === 'string' ? series.title : title,
      posterUrl,
      source,
      seasons: picked || hasEpisodePicks || unaired ? JSON.stringify([...(picked ?? []), ...episodeSummary, ...(unaired ? ['unaired'] : [])]) : monitor,
    });
  } catch (err) {
    console.error('[requestLedger] failed to record show request:', err instanceof Error ? err.message : err);
  }

  return { alreadyAdded: false };
}

export interface SonarrQueueItem {
  title: string;
  episode: string | null;
  status: string;
  trackedDownloadState: string;
  size: number;
  sizeleft: number;
  timeleft?: string;
  downloadId?: string;
}

export async function getSonarrQueue(): Promise<SonarrQueueItem[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');

  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/queue?includeSeries=true&includeEpisode=true&pageSize=50`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Sonarr queue failed: ${res.status}`);
  const data = await res.json();
  return (data.records ?? []).map((r: Record<string, unknown>) => {
    const episode = r.episode as { seasonNumber?: number; episodeNumber?: number } | undefined;
    return {
      title: (r.series as { title?: string } | undefined)?.title ?? (r.title as string | undefined) ?? 'Unknown',
      episode: episode ? `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}` : null,
      status: r.status as string,
      trackedDownloadState: r.trackedDownloadState as string,
      size: r.size as number,
      sizeleft: r.sizeleft as number,
      timeleft: r.timeleft as string | undefined,
      downloadId: r.downloadId as string | undefined,
    };
  }).sort((a: SonarrQueueItem, b: SonarrQueueItem) => trackedStatePriority(a.trackedDownloadState) - trackedStatePriority(b.trackedDownloadState));
}

/** Accepts whatever Sonarr's own manual-import suggestion is for this download - same as clicking "Import" in the Sonarr UI without changing anything. */
export async function forceImportSonarr(downloadId: string) {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');

  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Sonarr manual import lookup failed: ${res.status}`);
  const files = await res.json();
  if (!Array.isArray(files) || files.length === 0) throw new Error('No importable files found for this download');

  // The command endpoint wants plain seriesId/episodeIds, not the nested series/episodes objects the GET response returns
  const mappedFiles = files.map((f: Record<string, unknown>) => ({
    path: f.path,
    folderName: f.folderName,
    seriesId: (f.series as { id?: number } | undefined)?.id,
    episodeIds: (f.episodes as { id: number }[] | undefined)?.map((e) => e.id) ?? [],
    quality: f.quality,
    languages: f.languages,
    releaseGroup: f.releaseGroup,
    indexerFlags: f.indexerFlags,
    downloadId: f.downloadId,
  }));

  const cmdRes = await fetchWithTimeout(`${SONARR_URL}/api/v3/command`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'ManualImport', files: mappedFiles, importMode: 'auto' }),
  });
  if (!cmdRes.ok) throw new Error(await readableApiError(cmdRes, 'Sonarr import command failed'));
  return { triggered: true };
}

export interface ImportHistoryItem {
  /** History record id from Sonarr - unique per event, used as the stable React key downstream. */
  historyId: number;
  title: string;
  date: string;
  episode?: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  seriesId?: number;
  movieId?: number;
  /** The episode's air date (yyyy-mm-dd) - lets library checks match by date when a media server numbers seasons differently than TVDB. */
  airDate?: string | null;
}

export async function getSonarrRecentImports(limit = 10): Promise<ImportHistoryItem[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');

  const res = await fetchWithTimeout(
    `${SONARR_URL}/api/v3/history?page=1&pageSize=50&sortKey=date&sortDirection=descending&includeSeries=true&includeEpisode=true`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Sonarr history failed: ${res.status}`);
  const data = await res.json();
  return (data.records ?? [])
    .filter((r: Record<string, unknown>) => (r.eventType as string) === 'downloadFolderImported')
    .slice(0, limit)
    .map((r: Record<string, unknown>) => {
      const episode = r.episode as { seasonNumber?: number; episodeNumber?: number; airDateUtc?: string } | undefined;
      return {
        historyId: r.id as number,
        title: (r.series as { title?: string } | undefined)?.title ?? (r.sourceTitle as string | undefined) ?? 'Unknown',
        date: r.date as string,
        episode: episode?.seasonNumber !== undefined && episode?.episodeNumber !== undefined
          ? `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`
          : null,
        seasonNumber: episode?.seasonNumber,
        episodeNumber: episode?.episodeNumber,
        seriesId: r.seriesId as number,
        airDate: typeof episode?.airDateUtc === 'string' ? episode.airDateUtc.slice(0, 10) : null,
      };
    });
}

/** Episodes Sonarr knows are still coming for this show: a future air date, any season. Feeds the "N unaired episodes remain" tail on ready-to-watch pings. */
export async function getSonarrUnairedCount(seriesId: number): Promise<number> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/episode?seriesId=${seriesId}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Sonarr episode lookup failed: ${res.status}`);
  const episodes: Record<string, unknown>[] = await res.json();
  const now = Date.now();
  return episodes.filter((e) => typeof e.airDateUtc === 'string' && new Date(e.airDateUtc).getTime() > now).length;
}

/** Season:episode keys that currently have a file, for a series that's confirmed to still exist. */
export async function getSonarrEpisodeFileSet(seriesId: number): Promise<Set<string>> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/episode?seriesId=${seriesId}&includeEpisodeFile=true`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Sonarr episode lookup failed: ${res.status}`);
  const episodes: Record<string, unknown>[] = await res.json();
  const set = new Set<string>();
  for (const e of episodes) {
    if (e.hasFile) set.add(`${e.seasonNumber}:${e.episodeNumber}`);
  }
  return set;
}

/**
 * Refuses any app-driven delete touching a show on the Cleanup Excluded
 * Shows list. Those files are the user's irreplaceable hand-edited work
 * ("if they were to be deleted, all of that work is gone") - exclusion
 * means protected, not just hidden from cleanup suggestions.
 */
export async function assertSeriesDeletable(seriesId: number): Promise<void> {
  const title = await getProtectedTitle(seriesId);
  if (title !== null) {
    throw new Error(`"${title}" is protected (Cleanup Excluded Shows) - deleting it through Weavarr is blocked. Remove it from the list in Settings to allow this.`);
  }
}

/** The series' display title when it's on the protected list, else null. Shared by the delete guard and every UI surface that must hide its delete buttons. */
export async function getProtectedTitle(seriesId: number): Promise<string | null> {
  if (!SONARR_URL || !SONARR_KEY) return null;
  const { getExcludedShows } = await import('./cleanupCandidates');
  const excluded = getExcludedShows();
  if (excluded.size === 0) return null;
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/series/${seriesId}`, { headers: headers(), cache: 'no-store' });
  // 404 is the one answer that means "nothing to protect". Any other failure
  // (a 503 during a DB lock, a 401 from a rotated key) must block the delete,
  // not wave it through: this guard is the last line in front of files the
  // user has said are irreplaceable.
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Could not check the protected list (Sonarr answered ${res.status}) - delete blocked`);
  const detail = await res.json();
  return excluded.has(((detail.title as string) ?? '').trim().toLowerCase()) ? ((detail.title as string) ?? '') : null;
}

export interface SeriesDeleteAftermath {
  seriesId: number;
  remainingFiles: number;
  title: string;
  /** Sonarr production status: 'continuing' | 'ended' | 'upcoming' | 'deleted'. */
  status: string;
  monitorFuture: boolean;
}

/** Post-delete snapshot for the "that was the last episode" prompt: how many files remain, whether the show ended, and the current future-episodes setting (drives the modal's pre-checked box). */
export async function getSeriesDeleteAftermath(seriesId: number): Promise<SeriesDeleteAftermath> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const [episodes, detailRes] = await Promise.all([
    getSonarrSeriesEpisodes(seriesId),
    fetchWithTimeout(`${SONARR_URL}/api/v3/series/${seriesId}`, { headers: headers(), cache: 'no-store' }),
  ]);
  const detail = detailRes.ok ? await detailRes.json() : {};
  return {
    seriesId,
    remainingFiles: episodes.filter((e) => e.hasFile).length,
    title: (detail.title as string) ?? '',
    status: (detail.status as string) ?? 'unknown',
    monitorFuture: detail.monitorNewItems === 'all',
  };
}

/**
 * Delete every episode file of a series but KEEP its Sonarr registration -
 * the detail page's "episodes only" delete choice. Deleted episodes get
 * unmonitored so Sonarr doesn't immediately re-grab them; the series'
 * future-episodes setting is left alone.
 */
export async function deleteSonarrSeriesFiles(seriesId: number): Promise<number> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  await assertSeriesDeletable(seriesId);
  const info = await getSonarrEpisodeFileInfoMap(seriesId);
  const entries = Array.from(info.values());
  const fileIds = Array.from(new Set(entries.map((v) => v.episodeFileId).filter((id) => id > 0)));
  if (fileIds.length === 0) return 0;
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/episodefile/bulk`, {
    method: 'DELETE',
    headers: headers(),
    body: JSON.stringify({ episodeFileIds: fileIds }),
  });
  if (!res.ok) throw new Error(await readableApiError(res, 'Sonarr episode file delete failed'));
  await monitorSonarrEpisodes(entries.map((v) => v.episodeId), false).catch(() => {});
  return fileIds.length;
}

/** Did this episode EVER successfully import? Distinguishes "downloaded then deleted" from "never found" for the requests ledger - deletion is not still-searching. */
export async function sonarrEpisodeWasImported(episodeId: number): Promise<boolean> {
  if (!SONARR_URL || !SONARR_KEY) return false;
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/history?episodeId=${episodeId}&pageSize=50`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) return false;
  const data = await res.json();
  return ((data.records ?? []) as { eventType?: string }[]).some((r) => r.eventType === 'downloadFolderImported');
}

/** Like getSonarrEpisodeFileSet but keeps the episode titles - the Watch page's dropdowns read a lot better as "S01E02 · The Merge" than bare codes. Same single Sonarr call. */
export async function getSonarrEpisodeFileMap(seriesId: number): Promise<Map<string, string>> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/episode?seriesId=${seriesId}&includeEpisodeFile=true`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Sonarr episode lookup failed: ${res.status}`);
  const episodes: Record<string, unknown>[] = await res.json();
  const map = new Map<string, string>();
  for (const e of episodes) {
    if (e.hasFile) map.set(`${e.seasonNumber}:${e.episodeNumber}`, (e.title as string) ?? '');
  }
  return map;
}

export interface SonarrSeriesLite {
  id: number;
  title: string;
  tmdbId: number | null;
  posterPath: string | null;
}

export async function getSonarrSeriesList(): Promise<SonarrSeriesLite[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/series`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sonarr series list failed: ${res.status}`);
  const data = await res.json();
  return (data as Record<string, unknown>[]).map((s) => {
    const images = (s.images as SonarrImage[] | undefined) ?? [];
    return {
      id: s.id as number,
      tmdbId: typeof s.tmdbId === 'number' && (s.tmdbId as number) > 0 ? (s.tmdbId as number) : null,
      title: s.title as string,
      posterPath: images.find((img) => img.coverType === 'poster')?.url ?? null,
    };
  });
}

export interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  imdbId: string | null;
  /** TMDB id when Sonarr knows it (v4+), else resolved from tvdbId via TMDB's external-id lookup - lets library rows link to the in-app detail page. */
  tmdbId: number | null;
  tvdbId: number | null;
  episodeFileCount: number;
  episodeCount: number;
  sizeOnDisk: number;
  /** Sonarr production status: 'continuing' | 'ended' | 'upcoming' | 'deleted'. */
  status: string;
  /** Sonarr's own cached poster path (e.g. "/MediaCover/2/poster.jpg?lastWrite=..."), null if Sonarr has none. Served through /api/sonarr/image, never fetched directly - Sonarr's LAN address isn't reachable from outside the network. */
  posterPath: string | null;
}

interface SonarrImage {
  coverType?: string;
  url?: string;
}

export async function getAllSonarrSeries(): Promise<SonarrSeries[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/series`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sonarr series list failed: ${res.status}`);
  const data: Record<string, unknown>[] = await res.json();
  const series = data.map((s) => {
    const stats = s.statistics as Record<string, unknown> | undefined;
    const images = (s.images as SonarrImage[] | undefined) ?? [];
    return {
      id: s.id as number,
      title: s.title as string,
      year: s.year as number,
      imdbId: (s.imdbId as string) ?? null,
      tmdbId: typeof s.tmdbId === 'number' && s.tmdbId > 0 ? s.tmdbId : null,
      tvdbId: typeof s.tvdbId === 'number' && s.tvdbId > 0 ? (s.tvdbId as number) : null,
      episodeFileCount: (stats?.episodeFileCount as number) ?? 0,
      episodeCount: (stats?.episodeCount as number) ?? 0,
      sizeOnDisk: (stats?.sizeOnDisk as number) ?? 0,
      status: (s.status as string) ?? 'continuing',
      posterPath: images.find((img) => img.coverType === 'poster')?.url ?? null,
    };
  });

  // Sonarr's own metadata lacks tmdbId for some shows - resolve those via
  // TMDB's external-id lookup (week-long cache in lib/tmdb, so this costs
  // one call per missing show per week, not per page load). Gives those
  // shows their Details link and availability badge; a failed lookup just
  // leaves tmdbId null as before.
  await Promise.all(
    series
      .filter((s) => !s.tmdbId && (s.tvdbId || s.imdbId))
      .map(async (s) => {
        if (s.tvdbId) s.tmdbId = await findTvIdByTvdbId(s.tvdbId);
        if (!s.tmdbId && s.imdbId) s.tmdbId = await findTvIdByImdbId(s.imdbId);
      })
  );

  return series;
}

/**
 * The Sonarr series id if this IMDb-identified show is already added, otherwise
 * null - used to swap Request for Delete on the detail page. Deliberately scans
 * the actual series list rather than series/lookup?term=imdb:X, which (per
 * getRadarrMovieIdByTmdbId's Radarr equivalent, and confirmed live for Sonarr
 * too) can miss shows Sonarr already has.
 */
export async function getSonarrSeriesIdByImdbId(imdbId: string): Promise<number | null> {
  const all = await getAllSonarrSeries();
  return all.find((s) => s.imdbId === imdbId)?.id ?? null;
}

/** Removes the series from Sonarr entirely and deletes its file(s) from disk. */
export async function deleteSonarrSeries(seriesId: number): Promise<void> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  // Asserted here as well as in the routes, so no caller can skip it.
  await assertSeriesDeletable(seriesId);
  try {
    const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/series/${seriesId}?deleteFiles=true&addImportListExclusion=false`, {
      method: 'DELETE',
      headers: headers(),
    });
    // 404 = already gone - the goal state, not an error worth surfacing.
    if (!res.ok && res.status !== 404) throw new Error(await readableApiError(res, 'Sonarr series delete failed'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notifyAllChannels('Delete failed', `Sonarr series ${seriesId}: ${message}`, 'alert').catch(() => {});
    throw err;
  }
  await deleteCachedPoster('sonarr', seriesId);
}

export interface SonarrEpisode {
  id: number;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  hasFile: boolean;
  sizeOnDisk: number;
  /** null when Sonarr has no air date yet (TBA) - only aired episodes are worth searching for. */
  airDateUtc: string | null;
  episodeFileId: number | null;
}

/** True if this episode is missing and its air date has already passed - the set "download season" actually searches for. */
export function isSonarrEpisodeDownloadable(e: Pick<SonarrEpisode, 'hasFile' | 'airDateUtc'>): boolean {
  return !e.hasFile && !!e.airDateUtc && new Date(e.airDateUtc).getTime() <= Date.now();
}

/** On the schedule but not aired yet - the "Get unaired episodes" set. Episodes with no date at all are left out; nothing can grab those. */
export function isSonarrEpisodeUnaired(e: Pick<SonarrEpisode, 'hasFile' | 'airDateUtc'>): boolean {
  return !e.hasFile && !!e.airDateUtc && new Date(e.airDateUtc).getTime() > Date.now();
}

/** Every episode of a series, with file status - used for the per-episode management view (as opposed to getSonarrEpisodeFileSet's bare id set, used only for cleanup matching). */
export async function getSonarrSeriesEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/episode?seriesId=${seriesId}&includeEpisodeFile=true`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Sonarr episode lookup failed: ${res.status}`);
  const episodes: Record<string, unknown>[] = await res.json();
  return episodes
    .map((e) => {
      const file = e.episodeFile as Record<string, unknown> | undefined;
      return {
        id: e.id as number,
        seasonNumber: e.seasonNumber as number,
        episodeNumber: e.episodeNumber as number,
        title: (e.title as string) ?? `Episode ${e.episodeNumber as number}`,
        hasFile: Boolean(e.hasFile),
        sizeOnDisk: (file?.size as number) ?? 0,
        airDateUtc: (e.airDateUtc as string) ?? null,
        episodeFileId: (file?.id as number) ?? null,
      };
    })
    .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
}

export interface SonarrEpisodeFileInfo {
  episodeId: number;
  episodeFileId: number;
}

/** Finds the episode + file IDs for a specific season/episode of an already-added series - null if not found or no file on disk. */
/** One fetch per series: every episode that has a file, keyed "season:episode" -> ids. Callers resolving many episodes of the same show should use this instead of findSonarrEpisodeFile, which refetches the full episode list on every call. */
export async function getSonarrEpisodeFileInfoMap(seriesId: number): Promise<Map<string, SonarrEpisodeFileInfo>> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/episode?seriesId=${seriesId}&includeEpisodeFile=true`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Sonarr episode lookup failed: ${res.status}`);
  const episodes: Record<string, unknown>[] = await res.json();
  const map = new Map<string, SonarrEpisodeFileInfo>();
  for (const e of episodes) {
    const file = e.episodeFile as { id?: number } | undefined;
    if (e.hasFile && file?.id) {
      map.set(`${e.seasonNumber}:${e.episodeNumber}`, { episodeId: e.id as number, episodeFileId: file.id });
    }
  }
  return map;
}

export async function findSonarrEpisodeFile(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<SonarrEpisodeFileInfo | null> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/episode?seriesId=${seriesId}&includeEpisodeFile=true`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Sonarr episode lookup failed: ${res.status}`);
  const episodes: Record<string, unknown>[] = await res.json();
  const match = episodes.find(
    (e) => e.seasonNumber === seasonNumber && e.episodeNumber === episodeNumber && e.hasFile
  );
  if (!match) return null;
  const episodeFile = match.episodeFile as { id?: number } | undefined;
  if (!episodeFile?.id) return null;
  return { episodeId: match.id as number, episodeFileId: episodeFile.id };
}

/** Monitors and triggers one indexer search covering every given episode - same command Sonarr's own UI uses for a single episode or a whole season. Returns the command id so a caller can wait for it to finish. */
export async function triggerSonarrEpisodeSearch(episodeIds: number[]): Promise<number | null> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  if (episodeIds.length === 0) return null;

  const monitorRes = await fetchWithTimeout(`${SONARR_URL}/api/v3/episode/monitor`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ episodeIds, monitored: true }),
  });
  if (!monitorRes.ok) throw new Error(await readableApiError(monitorRes, 'Sonarr monitor failed'));

  const searchRes = await fetchWithTimeout(`${SONARR_URL}/api/v3/command`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'EpisodeSearch', episodeIds }),
  });
  if (!searchRes.ok) throw new Error(await readableApiError(searchRes, 'Sonarr episode search failed'));
  const command = await searchRes.json();
  return (command?.id as number) ?? null;
}

/** Polls a Sonarr command until it leaves the queued/started state, so a temporary profile override (below) stays in place for the actual search+grab instead of reverting the instant the request is fired. Gives up after timeoutMs and lets the caller revert anyway. */
async function waitForSonarrCommand(commandId: number, timeoutMs = 60000): Promise<void> {
  if (!SONARR_URL || !SONARR_KEY) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/command/${commandId}`, { headers: headers(), cache: 'no-store' });
    if (res.ok) {
      const data = await res.json();
      if (data.status === 'completed' || data.status === 'failed') return;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
}

/**
 * Runs fn() with the series' quality profile temporarily switched to
 * overrideProfileId, then switches it back afterward - Sonarr has no
 * per-search quality option, the profile lives on the series itself, so a
 * one-off "download this in a different quality" has to swap it there and
 * restore it after. Callers should wait for the search command to reach a
 * terminal state before returning from fn() (see waitForSonarrCommand),
 * otherwise the revert can race Sonarr's own grab decision.
 */
async function withTemporaryQualityProfile<T>(
  seriesId: number,
  overrideProfileId: number,
  fn: () => Promise<T>
): Promise<T> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const seriesRes = await fetchWithTimeout(`${SONARR_URL}/api/v3/series/${seriesId}`, { headers: headers(), cache: 'no-store' });
  if (!seriesRes.ok) throw new Error(`Sonarr series lookup failed: ${seriesRes.status}`);
  const series = await seriesRes.json();
  const originalProfileId = series.qualityProfileId as number;
  if (originalProfileId === overrideProfileId) return fn();

  async function setProfile(profileId: number) {
    const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/series/${seriesId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ ...series, qualityProfileId: profileId }),
    });
    if (!res.ok) throw new Error(await readableApiError(res, 'Sonarr series update failed'));
  }

  await setProfile(overrideProfileId);
  try {
    return await fn();
  } finally {
    await setProfile(originalProfileId);
  }
}

/** Monitors this episode and triggers an indexer search for it, same as clicking the search icon in Sonarr's own UI. profileOverrideId temporarily switches the series to that profile for this one search. */
export async function searchSonarrEpisode(episodeId: number, seriesId?: number, profileOverrideId?: number): Promise<void> {
  if (profileOverrideId && seriesId) {
    await withTemporaryQualityProfile(seriesId, profileOverrideId, async () => {
      const commandId = await triggerSonarrEpisodeSearch([episodeId]);
      if (commandId) await waitForSonarrCommand(commandId);
    });
  } else {
    await triggerSonarrEpisodeSearch([episodeId]);
  }
}

/** Searches for every missing, already-aired episode in one season in a single indexer search. profileOverrideId temporarily switches the series to that profile for this one search. */
export async function searchSonarrSeason(seriesId: number, seasonNumber: number, profileOverrideId?: number): Promise<void> {
  const episodes = await getSonarrSeriesEpisodes(seriesId);
  const episodeIds = episodes
    .filter((e) => e.seasonNumber === seasonNumber && isSonarrEpisodeDownloadable(e))
    .map((e) => e.id);

  if (profileOverrideId) {
    await withTemporaryQualityProfile(seriesId, profileOverrideId, async () => {
      const commandId = await triggerSonarrEpisodeSearch(episodeIds);
      if (commandId) await waitForSonarrCommand(commandId);
    });
  } else {
    await triggerSonarrEpisodeSearch(episodeIds);
  }
}

/** Deletes just this episode's file and unmonitors that single episode - leaves the series and every other episode untouched. */
export async function deleteSonarrEpisodeFile(episodeId: number, episodeFileId: number): Promise<void> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');

  try {
    const deleteRes = await fetchWithTimeout(`${SONARR_URL}/api/v3/episodefile/${episodeFileId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    // 404 = the file is already gone - proceed to the unmonitor step anyway.
    if (!deleteRes.ok && deleteRes.status !== 404) throw new Error(await readableApiError(deleteRes, 'Sonarr episode file delete failed'));

    const monitorRes = await fetchWithTimeout(`${SONARR_URL}/api/v3/episode/monitor`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ episodeIds: [episodeId], monitored: false }),
    });
    if (!monitorRes.ok) throw new Error(await readableApiError(monitorRes, 'Sonarr unmonitor failed'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notifyAllChannels('Delete failed', `Sonarr episode ${episodeId}: ${message}`, 'alert').catch(() => {});
    throw err;
  }
}

/** Unmonitors a single episode that never has a file to delete in the first place - "give up, stop searching" for a missing episode Sonarr can't find, as opposed to deleteSonarrEpisodeFile which removes an existing file. */
export async function unmonitorSonarrEpisode(episodeId: number): Promise<void> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  try {
    const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/episode/monitor`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ episodeIds: [episodeId], monitored: false }),
    });
    if (!res.ok) throw new Error(await readableApiError(res, 'Sonarr unmonitor failed'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notifyAllChannels('Delete failed', `Sonarr episode ${episodeId}: ${message}`, 'alert').catch(() => {});
    throw err;
  }
}

/** Deletes the file for every episode in this season that has one - leaves the series and every other season untouched. */
export async function deleteSonarrSeasonFiles(seriesId: number, seasonNumber: number): Promise<void> {
  await assertSeriesDeletable(seriesId);
  const episodes = await getSonarrSeriesEpisodes(seriesId);
  const withFiles = episodes.filter((e) => e.seasonNumber === seasonNumber && e.hasFile && e.episodeFileId);
  await Promise.all(withFiles.map((e) => deleteSonarrEpisodeFile(e.id, e.episodeFileId as number)));
}

export interface MissingAiredEpisode {
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

/**
 * Monitored episodes whose air date has already passed but which Sonarr
 * still has no file for - a gap Sonarr should have grabbed and didn't, as
 * opposed to something simply not aired yet. Pulls from Sonarr's own
 * wanted/missing list (already filtered to monitored + no file) and then
 * re-checks airDateUtc ourselves rather than trusting that endpoint's
 * default date handling, since it's been observed to include next-day
 * episodes too.
 */
export async function getMissingAiredEpisodes(): Promise<MissingAiredEpisode[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(
    `${SONARR_URL}/api/v3/wanted/missing?pageSize=1000&sortKey=airDateUtc&sortDirection=descending&includeSeries=true`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Sonarr wanted/missing failed: ${res.status}`);
  const data = await res.json();
  const now = Date.now();

  return (data.records as Record<string, unknown>[])
    .filter((r) => r.airDateUtc && new Date(r.airDateUtc as string).getTime() <= now)
    .map((r) => {
      const series = r.series as Record<string, unknown> | undefined;
      const images = (series?.images as { coverType?: string }[] | undefined) ?? [];
      return {
        episodeId: r.id as number,
        seriesId: r.seriesId as number,
        tmdbId: typeof series?.tmdbId === 'number' && (series.tmdbId as number) > 0 ? (series.tmdbId as number) : null,
        seriesTitle: (series?.title as string) ?? 'Unknown Show',
        hasPoster: images.some((img) => img.coverType === 'poster'),
        seasonNumber: r.seasonNumber as number,
        episodeNumber: r.episodeNumber as number,
        title: (r.title as string) ?? `Episode ${r.episodeNumber as number}`,
        airDateUtc: r.airDateUtc as string,
      };
    });
}

export interface SonarrCalendarItem {
  seriesId: number;
  seriesTitle: string;
  /** TMDB id of the series when Sonarr knows it (v4+) - lets the calendar link to the in-app detail page. */
  tmdbId: number | null;
  hasPoster: boolean;
  seasonNumber: number;
  episodeNumber: number;
  title: string;
  airDateUtc: string;
  hasFile: boolean;
  monitored: boolean;
}

/** Every episode airing in this date range across the whole library - same data Sonarr's own Calendar page shows. */
export async function getSonarrCalendar(start: string, end: string): Promise<SonarrCalendarItem[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(
    `${SONARR_URL}/api/v3/calendar?start=${start}&end=${end}&includeSeries=true`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Sonarr calendar failed: ${res.status}`);
  const data: Record<string, unknown>[] = await res.json();

  return data.map((e) => {
    const series = e.series as Record<string, unknown> | undefined;
    const images = (series?.images as { coverType?: string }[] | undefined) ?? [];
    return {
      seriesId: e.seriesId as number,
      seriesTitle: (series?.title as string) ?? 'Unknown Show',
      tmdbId: typeof series?.tmdbId === 'number' && series.tmdbId > 0 ? series.tmdbId : null,
      hasPoster: images.some((img) => img.coverType === 'poster'),
      seasonNumber: e.seasonNumber as number,
      episodeNumber: e.episodeNumber as number,
      title: (e.title as string) ?? `Episode ${e.episodeNumber as number}`,
      airDateUtc: e.airDateUtc as string,
      hasFile: Boolean(e.hasFile),
      monitored: Boolean(e.monitored),
    };
  });
}

/** Set monitored on a batch of episodes in one call. */
export async function monitorSonarrEpisodes(episodeIds: number[], monitored: boolean): Promise<void> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/episode/monitor`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ episodeIds, monitored }),
  });
  if (!res.ok) throw new Error(await readableApiError(res, 'Sonarr episode monitor failed'));
}

export interface SonarrSeriesState {
  seriesId: number;
  monitorFuture: boolean;
  /** On the Cleanup Excluded Shows list - delete affordances must not render. */
  protected: boolean;
  episodes: { seasonNumber: number; episodeNumber: number; hasFile: boolean }[];
}

/**
 * What Sonarr already has for this TMDB show - feeds the request modal's
 * owned/locked rendering and its editable future-seasons toggle. Null when
 * the show isn't added, which is what tells the modal to run in add mode.
 */
export async function getSonarrSeriesStateByTmdbId(tmdbId: number): Promise<SonarrSeriesState | null> {
  const all = await getAllSonarrSeries();
  const match = all.find((s) => s.tmdbId === tmdbId);
  if (!match) return null;

  const [detailRes, episodes] = await Promise.all([
    fetchWithTimeout(`${SONARR_URL}/api/v3/series/${match.id}`, { headers: headers(), cache: 'no-store' }),
    getSonarrSeriesEpisodes(match.id),
  ]);
  if (!detailRes.ok) throw new Error(`Sonarr series fetch failed: ${detailRes.status}`);
  const detail = await detailRes.json();

  const { getExcludedShows } = await import('./cleanupCandidates');
  return {
    seriesId: match.id,
    monitorFuture: detail.monitorNewItems === 'all',
    protected: getExcludedShows().has(match.title.trim().toLowerCase()),
    // Season 0 (specials) stays in on purpose - the request modal offers
    // specials now, so their owned/locked state has to be visible too.
    // Titles ride along so the modal can list episodes of seasons TMDB
    // doesn't know about (TVDB revival seasons).
    episodes: episodes.map((e) => ({ seasonNumber: e.seasonNumber, episodeNumber: e.episodeNumber, hasFile: e.hasFile, title: e.title })),
  };
}

async function sonarrLookup(term: string) {
  const doFetch = () =>
    fetchWithTimeout(`${SONARR_URL}/api/v3/series/lookup?term=${encodeURIComponent(term)}`, {
      headers: headers(),
      cache: 'no-store',
    });
  let res = await doFetch();
  // Sonarr's metadata upstream (skyhook) throws occasional one-off 5xxs
  // that clear on their own - pause and retry once before giving up.
  if (res.status >= 500) {
    await new Promise((resolve) => setTimeout(resolve, 2500));
    res = await doFetch();
  }
  if (!res.ok) {
    throw new Error(
      res.status >= 500
        ? "Sonarr couldn't reach its show database. That service usually recovers within a minute or two, so give it a moment and try again."
        : `Sonarr lookup failed: ${res.status}`
    );
  }
  return res.json();
}

/**
 * The exact series record the add flow would target, most specific key
 * first: TVDB id (Sonarr's own identity for a show), then IMDB id, then a
 * plain title search as the last resort. Browse and search cards only know
 * the TMDB id, so when one is given its TVDB/IMDB ids are resolved from
 * TMDB first - without that, "Big Brother" fell through to the title search
 * and Sonarr's first hit was the Czech edition (live, 2026-09-12).
 *
 * Sonarr's imdb: lookup uses a separate, less complete index than its
 * title search and can come back empty even for a show it knows by title
 * (confirmed live) - hence the chain rather than a single lookup.
 */
export async function lookupSonarrSeriesForAdd(imdbId: string | null, title: string, tmdbId?: number | null): Promise<Record<string, unknown> | null> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  let tvdbId: number | null = null;
  if (tmdbId) {
    const ext = await getTvExternalIds(tmdbId);
    tvdbId = ext.tvdbId;
    imdbId = imdbId ?? ext.imdbId;
  }
  let results = tvdbId ? await sonarrLookup(`tvdb:${tvdbId}`) : [];
  if (results.length === 0 && imdbId) results = await sonarrLookup(`imdb:${imdbId}`);
  if (results.length === 0) results = await sonarrLookup(title);
  return results[0] ?? null;
}

export interface LookupSeasonPreview {
  seasonNumber: number;
  episodeCount: number;
  /** First episode's air date - lets merged seasons drive the unaired chip and warning like TMDB ones. */
  airDate: string | null;
  episodes: { episodeNumber: number; title: string | null; airDate: string | null }[];
}

/**
 * TVDB's full season/episode picture for a show NOT in the library yet -
 * exactly what Sonarr itself would know right after adding it. The series
 * comes from the same lookup the add flow uses; the episode detail comes
 * straight from Sonarr's metadata service (skyhook), which serves it
 * publicly - Sonarr's lookup response carries no per-season data for
 * un-added shows. Skyhook being unreachable degrades to bare season
 * numbers, never an error - the picker still lists the seasons.
 */
export async function getSonarrLookupSeasonPreview(imdbId: string | null, title: string, tmdbId?: number | null): Promise<LookupSeasonPreview[]> {
  const series = await lookupSonarrSeriesForAdd(imdbId, title, tmdbId);
  if (!series) return [];
  const bare: LookupSeasonPreview[] = ((series.seasons ?? []) as { seasonNumber?: number }[])
    .map((s) => s.seasonNumber)
    .filter((n): n is number => typeof n === 'number' && n > 0)
    .map((n) => ({ seasonNumber: n, episodeCount: 0, airDate: null, episodes: [] }));

  const tvdbId = typeof series.tvdbId === 'number' && series.tvdbId > 0 ? series.tvdbId : null;
  if (!tvdbId) return bare;
  try {
    const res = await fetchWithTimeout(`https://skyhook.sonarr.tv/v1/tvdb/shows/en/${tvdbId}`, { next: { revalidate: 3600 } });
    if (!res.ok) return bare;
    const data = await res.json();
    const bySeason = new Map<number, LookupSeasonPreview>();
    for (const e of (data.episodes ?? []) as Record<string, unknown>[]) {
      const sn = e.seasonNumber;
      const en = e.episodeNumber;
      if (typeof sn !== 'number' || typeof en !== 'number' || sn <= 0) continue;
      const season = bySeason.get(sn) ?? { seasonNumber: sn, episodeCount: 0, airDate: null, episodes: [] };
      const airDate = typeof e.airDate === 'string' ? e.airDate : null;
      season.episodes.push({ episodeNumber: en, title: typeof e.title === 'string' ? e.title : null, airDate });
      season.episodeCount += 1;
      if (airDate && (season.airDate === null || airDate < season.airDate)) season.airDate = airDate;
      bySeason.set(sn, season);
    }
    if (bySeason.size === 0) return bare;
    return Array.from(bySeason.values())
      .sort((a, b) => a.seasonNumber - b.seasonNumber)
      .map((s) => ({ ...s, episodes: s.episodes.sort((a, b) => a.episodeNumber - b.episodeNumber) }));
  } catch {
    return bare;
  }
}

/**
 * "Get more" of an already-added series: monitor + search newly chosen full
 * seasons and hand-picked episodes, optionally change future-season
 * monitoring. Owned files are never touched - Sonarr searches only grab
 * what's missing, and hand-picked episodes that already have files are
 * filtered out here as a second guard.
 */
export async function expandSonarrSeries({
  seriesId,
  seasonNumbers = [],
  episodePicks = [],
  monitorFuture,
  unaired = false,
}: {
  seriesId: number;
  seasonNumbers?: number[];
  episodePicks?: { seasonNumber: number; episodeNumber: number }[];
  /** undefined = leave the setting as-is. */
  monitorFuture?: boolean;
  /** Monitor every not-yet-aired episode in any season. */
  unaired?: boolean;
}): Promise<void> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');

  // 1. Series-level update: season monitored flags + monitorNewItems. An
  //    unaired-only request still needs the series itself monitored.
  if (seasonNumbers.length > 0 || monitorFuture !== undefined || unaired) {
    const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/series/${seriesId}`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) throw new Error(`Sonarr series fetch failed: ${res.status}`);
    const series = await res.json();
    if (seasonNumbers.length > 0) {
      const chosen = new Set(seasonNumbers);
      series.seasons = (series.seasons as { seasonNumber: number; monitored: boolean }[]).map((s) =>
        chosen.has(s.seasonNumber) ? { ...s, monitored: true } : s
      );
    }
    if (monitorFuture !== undefined) series.monitorNewItems = monitorFuture ? 'all' : 'none';
    series.monitored = true;
    const putRes = await fetchWithTimeout(`${SONARR_URL}/api/v3/series/${seriesId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(series),
    });
    if (!putRes.ok) throw new Error(await readableApiError(putRes, 'Sonarr series update failed'));
  }

  // 2. Hand-picked episodes: monitor + one batched episode search.
  if (episodePicks.length > 0) {
    const episodes = await getSonarrSeriesEpisodes(seriesId);
    const wanted = new Set(episodePicks.map((p) => `${p.seasonNumber}:${p.episodeNumber}`));
    const ids = episodes
      .filter((e) => wanted.has(`${e.seasonNumber}:${e.episodeNumber}`) && !e.hasFile)
      .map((e) => e.id);
    if (ids.length > 0) {
      await monitorSonarrEpisodes(ids, true);
      await triggerSonarrEpisodeSearch(ids);
    }
  }

  // 2b. Unaired episodes: monitor only. They have nothing to search for yet;
  //     Sonarr's feed grabs them the moment they air.
  if (unaired) {
    const episodes = await getSonarrSeriesEpisodes(seriesId);
    const ids = episodes.filter(isSonarrEpisodeUnaired).map((e) => e.id);
    if (ids.length > 0) await monitorSonarrEpisodes(ids, true);
  }

  // 3. Full-season searches (missing episodes only, by design of searchSonarrSeason).
  for (const seasonNumber of seasonNumbers) {
    await searchSonarrSeason(seriesId, seasonNumber).catch(() => {
      // a season with nothing aired/missing simply has nothing to search
    });
  }

  // A "Get more" that asked for actual content is a request - the ledger
  // records it like the add path does. A bare future-toggle change isn't.
  if (seasonNumbers.length > 0 || episodePicks.length > 0 || unaired) {
    const summary = JSON.stringify([
      ...seasonNumbers,
      ...episodePicks.map((p) => `S${p.seasonNumber}E${p.episodeNumber}`),
      ...(unaired ? ['unaired'] : []),
    ]);
    await recordExistingSeriesRequest(seriesId, summary);
  }
}

/**
 * Ledger row for a human action on an ALREADY-ADDED series ("Get more",
 * missing-episode searches) - the add path records its own. The user's
 * words when this was missing: "Requests don't seem to be working. i am
 * asking it to download missing friends. nothing is showing up there." A
 * search for something you don't have IS a request. Never throws -
 * bookkeeping must not break the action itself.
 */
async function recordExistingSeriesRequest(seriesId: number, seasons: string | null): Promise<void> {
  try {
    if (!SONARR_URL || !SONARR_KEY) return;
    const res = await fetchWithTimeout(`${SONARR_URL}/api/v3/series/${seriesId}`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) return;
    const series = await res.json();
    const posterUrl =
      (series.images as { coverType?: string; remoteUrl?: string }[] | undefined)?.find((i) => i.coverType === 'poster')?.remoteUrl ?? null;
    let tmdbId: number | null = typeof series.tmdbId === 'number' && series.tmdbId > 0 ? series.tmdbId : null;
    if (!tmdbId && typeof series.tvdbId === 'number' && series.tvdbId > 0) {
      tmdbId = (await findTvIdByTvdbId(series.tvdbId).catch(() => null)) ?? null;
    }
    recordRequest({
      tmdbId,
      tvdbId: typeof series.tvdbId === 'number' && series.tvdbId > 0 ? series.tvdbId : null,
      mediaType: 'tv',
      title: (series.title as string) ?? `series:${seriesId}`,
      posterUrl,
      source: 'app',
      seasons,
    });
  } catch (err) {
    console.error('[requestLedger] failed to record series request:', err instanceof Error ? err.message : err);
  }
}

/** Missing-episode searches: resolve the episode ids to SnEn labels and record one ledger row for the batch. */
export async function recordEpisodeSearchRequest(seriesId: number, episodeIds: number[]): Promise<void> {
  try {
    const episodes = await getSonarrSeriesEpisodes(seriesId);
    const idSet = new Set(episodeIds);
    const labels = episodes.filter((e) => idSet.has(e.id)).map((e) => `S${e.seasonNumber}E${e.episodeNumber}`);
    await recordExistingSeriesRequest(seriesId, labels.length > 0 ? JSON.stringify(labels) : null);
  } catch (err) {
    console.error('[requestLedger] failed to record search request:', err instanceof Error ? err.message : err);
  }
}
