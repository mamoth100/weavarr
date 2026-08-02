import { pickQualityProfile } from './qualityProfile';
import { trackedStatePriority } from './queuePriority';

// Stripped of any trailing slash - see the same fix in lib/plex.ts for why.
const RADARR_URL = process.env.RADARR_URL?.replace(/\/$/, '');
const RADARR_KEY = process.env.RADARR_KEY;
const RADARR_DEFAULT_PROFILE = process.env.RADARR_DEFAULT_PROFILE || null;
const RADARR_HIGHEST_PROFILE = process.env.RADARR_HIGHEST_PROFILE || null;

function headers() {
  return { 'X-Api-Key': RADARR_KEY as string, 'Content-Type': 'application/json' };
}

/**
 * The Radarr movie id if this TMDB movie is already added, otherwise null -
 * used both to swap Request for Delete on the detail page and to check
 * "already added" before submitting a new request. Deliberately queries the
 * actual movie list (not /movie/lookup/tmdb, which doesn't reliably return
 * an id for movies already in the library even when one exists).
 */
export async function getRadarrMovieIdByTmdbId(tmdbId: number): Promise<number | null> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');
  const res = await fetch(`${RADARR_URL}/api/v3/movie?tmdbId=${tmdbId}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Radarr movie lookup failed: ${res.status}`);
  const movies = await res.json();
  return Array.isArray(movies) && movies.length > 0 ? movies[0].id ?? null : null;
}

/** The Radarr quality profiles available to pick from - used by the advanced per-request override in RequestButton. */
export async function getRadarrQualityProfiles(): Promise<{ id: number; name: string }[]> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');
  const res = await fetch(`${RADARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Radarr quality profile list failed: ${res.status}`);
  return res.json();
}

/** profileOverride (an exact profile name) wins over the Settings default/highest pick for this one request. */
export async function addMovieToRadarr(tmdbId: number, highestQuality = false, profileOverride?: string | null) {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');

  const existingId = await getRadarrMovieIdByTmdbId(tmdbId);
  if (existingId) return { alreadyAdded: true };

  const lookupRes = await fetch(`${RADARR_URL}/api/v3/movie/lookup/tmdb?tmdbId=${tmdbId}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!lookupRes.ok) throw new Error(`Radarr lookup failed: ${lookupRes.status}`);
  const movie = await lookupRes.json();

  const [profilesRes, foldersRes] = await Promise.all([
    fetch(`${RADARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' }),
    fetch(`${RADARR_URL}/api/v3/rootfolder`, { headers: headers(), cache: 'no-store' }),
  ]);
  const profiles = await profilesRes.json();
  const folders = await foldersRes.json();
  if (!profiles?.length) throw new Error('Radarr has no quality profile configured');
  if (!folders?.length) throw new Error('Radarr has no root folder configured');

  const preferredName = profileOverride || (highestQuality ? RADARR_HIGHEST_PROFILE : RADARR_DEFAULT_PROFILE);
  const profile = pickQualityProfile(profiles, highestQuality, preferredName);

  const addRes = await fetch(`${RADARR_URL}/api/v3/movie`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      ...movie,
      qualityProfileId: profile.id,
      rootFolderPath: folders[0].path,
      monitored: true,
      addOptions: { searchForMovie: true },
    }),
  });
  if (!addRes.ok) throw new Error(`Radarr add failed: ${await addRes.text()}`);
  return { alreadyAdded: false };
}

export interface RadarrQueueItem {
  title: string;
  status: string;
  trackedDownloadState: string;
  size: number;
  sizeleft: number;
  timeleft?: string;
  downloadId?: string;
}

export async function getRadarrQueue(): Promise<RadarrQueueItem[]> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');

  const res = await fetch(`${RADARR_URL}/api/v3/queue?includeMovie=true&pageSize=50`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Radarr queue failed: ${res.status}`);
  const data = await res.json();
  return (data.records ?? []).map((r: Record<string, unknown>) => ({
    title: (r.movie as { title?: string } | undefined)?.title ?? (r.title as string | undefined) ?? 'Unknown',
    status: r.status as string,
    trackedDownloadState: r.trackedDownloadState as string,
    size: r.size as number,
    sizeleft: r.sizeleft as number,
    timeleft: r.timeleft as string | undefined,
    downloadId: r.downloadId as string | undefined,
  })).sort((a: RadarrQueueItem, b: RadarrQueueItem) => trackedStatePriority(a.trackedDownloadState) - trackedStatePriority(b.trackedDownloadState));
}

/** Accepts whatever Radarr's own manual-import suggestion is for this download - the same result you'd get clicking "Import" in the Radarr UI without changing anything. */
export async function forceImportRadarr(downloadId: string) {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');

  const res = await fetch(`${RADARR_URL}/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Radarr manual import lookup failed: ${res.status}`);
  const files = await res.json();
  if (!Array.isArray(files) || files.length === 0) throw new Error('No importable files found for this download');

  // The command endpoint wants a plain movieId, not the nested movie object the GET response returns
  const mappedFiles = files.map((f: Record<string, unknown>) => ({
    path: f.path,
    folderName: f.folderName,
    movieId: (f.movie as { id?: number } | undefined)?.id,
    quality: f.quality,
    languages: f.languages,
    releaseGroup: f.releaseGroup,
    indexerFlags: f.indexerFlags,
    downloadId: f.downloadId,
  }));

  const cmdRes = await fetch(`${RADARR_URL}/api/v3/command`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'ManualImport', files: mappedFiles, importMode: 'auto' }),
  });
  if (!cmdRes.ok) throw new Error(`Radarr import command failed: ${await cmdRes.text()}`);
  return { triggered: true };
}

export interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  hasFile: boolean;
  sizeOnDisk: number;
  tmdbId: number;
}

export async function getAllRadarrMovies(): Promise<RadarrMovie[]> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');
  const res = await fetch(`${RADARR_URL}/api/v3/movie`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Radarr movie list failed: ${res.status}`);
  const data: Record<string, unknown>[] = await res.json();
  return data.map((m) => ({
    id: m.id as number,
    title: m.title as string,
    year: m.year as number,
    hasFile: m.hasFile as boolean,
    sizeOnDisk: (m.sizeOnDisk as number) ?? 0,
    tmdbId: m.tmdbId as number,
  }));
}

/** Removes the movie from Radarr entirely and deletes its file(s) from disk. */
export async function deleteRadarrMovie(movieId: number): Promise<void> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');
  const res = await fetch(`${RADARR_URL}/api/v3/movie/${movieId}?deleteFiles=true&addImportExclusion=false`, {
    method: 'DELETE',
    headers: headers(),
  });
  if (!res.ok) throw new Error(`Radarr movie delete failed: ${await res.text()}`);
}

export interface ImportHistoryItem {
  title: string;
  date: string;
  episode?: string | null;
  seasonNumber?: number;
  episodeNumber?: number;
  movieId?: number;
  seriesId?: number;
}

export async function getRadarrRecentImports(limit = 10): Promise<ImportHistoryItem[]> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');

  const res = await fetch(
    `${RADARR_URL}/api/v3/history?page=1&pageSize=${limit}&sortKey=date&sortDirection=descending&includeMovie=true`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Radarr history failed: ${res.status}`);
  const data = await res.json();
  return (data.records ?? [])
    .filter((r: Record<string, unknown>) => (r.eventType as string) === 'downloadFolderImported')
    .map((r: Record<string, unknown>) => ({
      title: (r.movie as { title?: string } | undefined)?.title ?? (r.sourceTitle as string | undefined) ?? 'Unknown',
      date: r.date as string,
      movieId: r.movieId as number,
    }));
}
