import { pickQualityProfile } from './qualityProfile';
import { trackedStatePriority } from './queuePriority';
import { deleteCachedPoster } from './posterCache';
import { notifyAllChannels } from './notificationChannels';

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
  const res = await fetch(`${SONARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sonarr quality profile list failed: ${res.status}`);
  return res.json();
}

export async function addSeriesToSonarr({
  imdbId,
  title,
  monitor = 'all',
  seasonNumber,
  highestQuality = false,
  profileOverride,
}: {
  imdbId: string | null;
  title: string;
  monitor?: string;
  seasonNumber?: number;
  highestQuality?: boolean;
  /** An exact profile name that wins over the Settings default/highest pick for this one request. */
  profileOverride?: string | null;
}) {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');

  async function lookup(term: string) {
    const res = await fetch(`${SONARR_URL}/api/v3/series/lookup?term=${encodeURIComponent(term)}`, {
      headers: headers(),
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`Sonarr lookup failed: ${res.status}`);
    return res.json();
  }

  // Sonarr's imdb: lookup uses a separate, less complete index than its
  // title search and can come back empty even for a show it knows by title
  // (confirmed live: it has no imdb: entry for its own reported imdbId on
  // some shows) - fall back to a plain title search when that happens.
  let results = imdbId ? await lookup(`imdb:${imdbId}`) : [];
  if (results.length === 0) results = await lookup(title);
  const series = results[0];
  if (!series) throw new Error('No matching series found in Sonarr');

  if (series.id) return { alreadyAdded: true };

  const [profilesRes, foldersRes] = await Promise.all([
    fetch(`${SONARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' }),
    fetch(`${SONARR_URL}/api/v3/rootfolder`, { headers: headers(), cache: 'no-store' }),
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

  // A specific season number wins over the preset monitor strategy: hand-pick
  // which season is monitored and leave addOptions.monitor out so Sonarr
  // doesn't overwrite that per-season choice.
  const seasons = seasonNumber !== undefined
    ? (series.seasons as { seasonNumber: number }[]).map((s) => ({ ...s, monitored: s.seasonNumber === seasonNumber }))
    : series.seasons;

  const addRes = await fetch(`${SONARR_URL}/api/v3/series`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      ...series,
      seasons,
      qualityProfileId: profile.id,
      rootFolderPath: folders[0].path,
      monitored: true,
      addOptions: seasonNumber !== undefined
        ? { searchForMissingEpisodes: true }
        : { monitor, searchForMissingEpisodes: monitor !== 'future' },
    }),
  });
  if (!addRes.ok) throw new Error(`Sonarr add failed: ${await addRes.text()}`);
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

  const res = await fetch(`${SONARR_URL}/api/v3/queue?includeSeries=true&includeEpisode=true&pageSize=50`, {
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

  const res = await fetch(`${SONARR_URL}/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`, {
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

  const cmdRes = await fetch(`${SONARR_URL}/api/v3/command`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'ManualImport', files: mappedFiles, importMode: 'auto' }),
  });
  if (!cmdRes.ok) throw new Error(`Sonarr import command failed: ${await cmdRes.text()}`);
  return { triggered: true };
}

export interface ImportHistoryItem {
  title: string;
  date: string;
  episode?: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  seriesId?: number;
  movieId?: number;
}

export async function getSonarrRecentImports(limit = 10): Promise<ImportHistoryItem[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');

  const res = await fetch(
    `${SONARR_URL}/api/v3/history?page=1&pageSize=50&sortKey=date&sortDirection=descending&includeSeries=true&includeEpisode=true`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Sonarr history failed: ${res.status}`);
  const data = await res.json();
  return (data.records ?? [])
    .filter((r: Record<string, unknown>) => (r.eventType as string) === 'downloadFolderImported')
    .slice(0, limit)
    .map((r: Record<string, unknown>) => {
      const episode = r.episode as { seasonNumber?: number; episodeNumber?: number } | undefined;
      return {
        title: (r.series as { title?: string } | undefined)?.title ?? (r.sourceTitle as string | undefined) ?? 'Unknown',
        date: r.date as string,
        episode: episode?.seasonNumber !== undefined && episode?.episodeNumber !== undefined
          ? `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}`
          : null,
        seasonNumber: episode?.seasonNumber,
        episodeNumber: episode?.episodeNumber,
        seriesId: r.seriesId as number,
      };
    });
}

/** Season:episode keys that currently have a file, for a series that's confirmed to still exist. */
export async function getSonarrEpisodeFileSet(seriesId: number): Promise<Set<string>> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetch(`${SONARR_URL}/api/v3/episode?seriesId=${seriesId}&includeEpisodeFile=true`, {
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

export interface SonarrSeriesLite {
  id: number;
  title: string;
  posterPath: string | null;
}

export async function getSonarrSeriesList(): Promise<SonarrSeriesLite[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetch(`${SONARR_URL}/api/v3/series`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sonarr series list failed: ${res.status}`);
  const data = await res.json();
  return (data as Record<string, unknown>[]).map((s) => {
    const images = (s.images as SonarrImage[] | undefined) ?? [];
    return {
      id: s.id as number,
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
  const res = await fetch(`${SONARR_URL}/api/v3/series`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sonarr series list failed: ${res.status}`);
  const data: Record<string, unknown>[] = await res.json();
  return data.map((s) => {
    const stats = s.statistics as Record<string, unknown> | undefined;
    const images = (s.images as SonarrImage[] | undefined) ?? [];
    return {
      id: s.id as number,
      title: s.title as string,
      year: s.year as number,
      imdbId: (s.imdbId as string) ?? null,
      episodeFileCount: (stats?.episodeFileCount as number) ?? 0,
      episodeCount: (stats?.episodeCount as number) ?? 0,
      sizeOnDisk: (stats?.sizeOnDisk as number) ?? 0,
      status: (s.status as string) ?? 'continuing',
      posterPath: images.find((img) => img.coverType === 'poster')?.url ?? null,
    };
  });
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
  try {
    const res = await fetch(`${SONARR_URL}/api/v3/series/${seriesId}?deleteFiles=true&addImportListExclusion=false`, {
      method: 'DELETE',
      headers: headers(),
    });
    if (!res.ok) throw new Error(`Sonarr series delete failed: ${await res.text()}`);
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

/** Every episode of a series, with file status - used for the per-episode management view (as opposed to getSonarrEpisodeFileSet's bare id set, used only for cleanup matching). */
export async function getSonarrSeriesEpisodes(seriesId: number): Promise<SonarrEpisode[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetch(`${SONARR_URL}/api/v3/episode?seriesId=${seriesId}&includeEpisodeFile=true`, {
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
export async function findSonarrEpisodeFile(
  seriesId: number,
  seasonNumber: number,
  episodeNumber: number
): Promise<SonarrEpisodeFileInfo | null> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetch(`${SONARR_URL}/api/v3/episode?seriesId=${seriesId}&includeEpisodeFile=true`, {
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
async function triggerSonarrEpisodeSearch(episodeIds: number[]): Promise<number | null> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  if (episodeIds.length === 0) return null;

  const monitorRes = await fetch(`${SONARR_URL}/api/v3/episode/monitor`, {
    method: 'PUT',
    headers: headers(),
    body: JSON.stringify({ episodeIds, monitored: true }),
  });
  if (!monitorRes.ok) throw new Error(`Sonarr monitor failed: ${await monitorRes.text()}`);

  const searchRes = await fetch(`${SONARR_URL}/api/v3/command`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'EpisodeSearch', episodeIds }),
  });
  if (!searchRes.ok) throw new Error(`Sonarr episode search failed: ${await searchRes.text()}`);
  const command = await searchRes.json();
  return (command?.id as number) ?? null;
}

/** Polls a Sonarr command until it leaves the queued/started state, so a temporary profile override (below) stays in place for the actual search+grab instead of reverting the instant the request is fired. Gives up after timeoutMs and lets the caller revert anyway. */
async function waitForSonarrCommand(commandId: number, timeoutMs = 60000): Promise<void> {
  if (!SONARR_URL || !SONARR_KEY) return;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await fetch(`${SONARR_URL}/api/v3/command/${commandId}`, { headers: headers(), cache: 'no-store' });
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
  const seriesRes = await fetch(`${SONARR_URL}/api/v3/series/${seriesId}`, { headers: headers(), cache: 'no-store' });
  if (!seriesRes.ok) throw new Error(`Sonarr series lookup failed: ${seriesRes.status}`);
  const series = await seriesRes.json();
  const originalProfileId = series.qualityProfileId as number;
  if (originalProfileId === overrideProfileId) return fn();

  async function setProfile(profileId: number) {
    const res = await fetch(`${SONARR_URL}/api/v3/series/${seriesId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ ...series, qualityProfileId: profileId }),
    });
    if (!res.ok) throw new Error(`Sonarr series update failed: ${await res.text()}`);
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
    const deleteRes = await fetch(`${SONARR_URL}/api/v3/episodefile/${episodeFileId}`, {
      method: 'DELETE',
      headers: headers(),
    });
    if (!deleteRes.ok) throw new Error(`Sonarr episode file delete failed: ${await deleteRes.text()}`);

    const monitorRes = await fetch(`${SONARR_URL}/api/v3/episode/monitor`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ episodeIds: [episodeId], monitored: false }),
    });
    if (!monitorRes.ok) throw new Error(`Sonarr unmonitor failed: ${await monitorRes.text()}`);
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
    const res = await fetch(`${SONARR_URL}/api/v3/episode/monitor`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ episodeIds: [episodeId], monitored: false }),
    });
    if (!res.ok) throw new Error(`Sonarr unmonitor failed: ${await res.text()}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notifyAllChannels('Delete failed', `Sonarr episode ${episodeId}: ${message}`, 'alert').catch(() => {});
    throw err;
  }
}

/** Deletes the file for every episode in this season that has one - leaves the series and every other season untouched. */
export async function deleteSonarrSeasonFiles(seriesId: number, seasonNumber: number): Promise<void> {
  const episodes = await getSonarrSeriesEpisodes(seriesId);
  const withFiles = episodes.filter((e) => e.seasonNumber === seasonNumber && e.hasFile && e.episodeFileId);
  await Promise.all(withFiles.map((e) => deleteSonarrEpisodeFile(e.id, e.episodeFileId as number)));
}

export interface MissingAiredEpisode {
  episodeId: number;
  seriesId: number;
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
  const res = await fetch(
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
  const res = await fetch(
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
