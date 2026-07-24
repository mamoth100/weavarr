import { pickQualityProfile } from './qualityProfile';
import { trackedStatePriority } from './queuePriority';

const SONARR_URL = process.env.SONARR_URL;
const SONARR_KEY = process.env.SONARR_KEY;

function headers() {
  return { 'X-Api-Key': SONARR_KEY as string, 'Content-Type': 'application/json' };
}

export async function addSeriesToSonarr({
  imdbId,
  title,
  monitor = 'all',
  seasonNumber,
  highestQuality = false,
}: {
  imdbId: string | null;
  title: string;
  monitor?: string;
  seasonNumber?: number;
  highestQuality?: boolean;
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
  // some shows) — fall back to a plain title search when that happens.
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

  const profile = pickQualityProfile(profiles, highestQuality);

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

/** Accepts whatever Sonarr's own manual-import suggestion is for this download — same as clicking "Import" in the Sonarr UI without changing anything. */
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
}

export async function getSonarrSeriesList(): Promise<SonarrSeriesLite[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetch(`${SONARR_URL}/api/v3/series`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sonarr series list failed: ${res.status}`);
  const data = await res.json();
  return (data as Record<string, unknown>[]).map((s) => ({ id: s.id as number, title: s.title as string }));
}

export interface SonarrSeries {
  id: number;
  title: string;
  year: number;
  imdbId: string | null;
  episodeFileCount: number;
  episodeCount: number;
  sizeOnDisk: number;
}

export async function getAllSonarrSeries(): Promise<SonarrSeries[]> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');
  const res = await fetch(`${SONARR_URL}/api/v3/series`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Sonarr series list failed: ${res.status}`);
  const data: Record<string, unknown>[] = await res.json();
  return data.map((s) => {
    const stats = s.statistics as Record<string, unknown> | undefined;
    return {
      id: s.id as number,
      title: s.title as string,
      year: s.year as number,
      imdbId: (s.imdbId as string) ?? null,
      episodeFileCount: (stats?.episodeFileCount as number) ?? 0,
      episodeCount: (stats?.episodeCount as number) ?? 0,
      sizeOnDisk: (stats?.sizeOnDisk as number) ?? 0,
    };
  });
}

/**
 * The Sonarr series id if this IMDb-identified show is already added, otherwise
 * null — used to swap Request for Delete on the detail page. Deliberately scans
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
  const res = await fetch(`${SONARR_URL}/api/v3/series/${seriesId}?deleteFiles=true&addImportListExclusion=false`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Sonarr series delete failed: ${await res.text()}`);
}

export interface SonarrEpisodeFileInfo {
  episodeId: number;
  episodeFileId: number;
}

/** Finds the episode + file IDs for a specific season/episode of an already-added series — null if not found or no file on disk. */
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

/** Deletes just this episode's file and unmonitors that single episode — leaves the series and every other episode untouched. */
export async function deleteSonarrEpisodeFile(episodeId: number, episodeFileId: number): Promise<void> {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');

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
}
