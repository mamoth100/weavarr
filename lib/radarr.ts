import { pickQualityProfile } from './qualityProfile';

const RADARR_URL = process.env.RADARR_URL;
const RADARR_KEY = process.env.RADARR_KEY;

function headers() {
  return { 'X-Api-Key': RADARR_KEY as string, 'Content-Type': 'application/json' };
}

export async function addMovieToRadarr(tmdbId: number, highestQuality = false) {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');

  const lookupRes = await fetch(`${RADARR_URL}/api/v3/movie/lookup/tmdb?tmdbId=${tmdbId}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!lookupRes.ok) throw new Error(`Radarr lookup failed: ${lookupRes.status}`);
  const movie = await lookupRes.json();

  if (movie.id) return { alreadyAdded: true };

  const [profilesRes, foldersRes] = await Promise.all([
    fetch(`${RADARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' }),
    fetch(`${RADARR_URL}/api/v3/rootfolder`, { headers: headers(), cache: 'no-store' }),
  ]);
  const profiles = await profilesRes.json();
  const folders = await foldersRes.json();
  if (!profiles?.length) throw new Error('Radarr has no quality profile configured');
  if (!folders?.length) throw new Error('Radarr has no root folder configured');

  const profile = pickQualityProfile(profiles, highestQuality);

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
  }));
}

/** Accepts whatever Radarr's own manual-import suggestion is for this download — the same result you'd get clicking "Import" in the Radarr UI without changing anything. */
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

export interface ImportHistoryItem {
  title: string;
  date: string;
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
    }));
}
