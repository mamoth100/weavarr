import { fetchWithTimeout } from './fetchTimeout';
import { pickQualityProfile } from './qualityProfile';
import { trackedStatePriority } from './queuePriority';
import { deleteCachedPoster } from './posterCache';
import { notifyAllChannels } from './notificationChannels';
import { recordRequest } from './requestLedger';
import { readableApiError } from './httpError';

// Enable defaults on (unset !== 'false') - Radarr is core to this app and
// was configurable long before this toggle existed, so an unset env var
// must keep meaning "on" for every existing setup. Blanking both URL and
// key when disabled means every existing `if (!RADARR_URL...)` check
// throughout this file already treats "disabled" the same as "not
// configured" for free, with no changes needed at each call site.
const RADARR_ENABLED = process.env.ENABLE_RADARR !== 'false';
// Stripped of any trailing slash - see the same fix in lib/plex.ts for why.
const RADARR_URL = RADARR_ENABLED ? process.env.RADARR_URL?.replace(/\/$/, '') : undefined;
const RADARR_KEY = RADARR_ENABLED ? process.env.RADARR_KEY : undefined;
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
  const res = await fetchWithTimeout(`${RADARR_URL}/api/v3/movie?tmdbId=${tmdbId}`, {
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
  const res = await fetchWithTimeout(`${RADARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Radarr quality profile list failed: ${res.status}`);
  return res.json();
}

/** profileOverride (an exact profile name) wins over the Settings default/highest pick for this one request. */
export async function addMovieToRadarr(tmdbId: number, highestQuality = false, profileOverride?: string | null, source: 'app' | 'watchlist' = 'app') {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');

  const existingId = await getRadarrMovieIdByTmdbId(tmdbId);
  if (existingId) return { alreadyAdded: true };

  const lookupRes = await fetchWithTimeout(`${RADARR_URL}/api/v3/movie/lookup/tmdb?tmdbId=${tmdbId}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!lookupRes.ok) throw new Error(`Radarr lookup failed: ${lookupRes.status}`);
  const movie = await lookupRes.json();

  const [profilesRes, foldersRes] = await Promise.all([
    fetchWithTimeout(`${RADARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' }),
    fetchWithTimeout(`${RADARR_URL}/api/v3/rootfolder`, { headers: headers(), cache: 'no-store' }),
  ]);
  const profiles = await profilesRes.json();
  const folders = await foldersRes.json();
  if (!profiles?.length) throw new Error('Radarr has no quality profile configured');
  if (!folders?.length) throw new Error('Radarr has no root folder configured');

  const preferredName = profileOverride || (highestQuality ? RADARR_HIGHEST_PROFILE : RADARR_DEFAULT_PROFILE);
  const profile = pickQualityProfile(profiles, preferredName);
  if (preferredName && profile.name.toLowerCase() !== preferredName.trim().toLowerCase()) {
    notifyAllChannels(
      'Quality profile mismatch',
      `Radarr has no profile named "${preferredName}" - "${movie.title}" was added using "${profile.name}" instead.`,
      'alert'
    ).catch(() => {});
  }

  const addRes = await fetchWithTimeout(`${RADARR_URL}/api/v3/movie`, {
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
  if (!addRes.ok) throw new Error(await readableApiError(addRes, 'Radarr add failed'));

  // The permanent request ledger - never let a bookkeeping failure break the add itself.
  try {
    const posterUrl =
      (movie.images as { coverType?: string; remoteUrl?: string }[] | undefined)?.find((i) => i.coverType === 'poster')?.remoteUrl ??
      (movie.remotePoster as string | undefined) ??
      null;
    recordRequest({ tmdbId, mediaType: 'movie', title: movie.title ?? `tmdb:${tmdbId}`, posterUrl, source });
  } catch (err) {
    console.error('[requestLedger] failed to record movie request:', err instanceof Error ? err.message : err);
  }

  return { alreadyAdded: false };
}

/** Ledger row for a search on an already-added movie (Movies Not Found "Search Again") - a search for something you don't have is a request. Never throws. */
export async function recordMovieSearchRequest(movieId: number): Promise<void> {
  try {
    if (!RADARR_URL || !RADARR_KEY) return;
    const res = await fetchWithTimeout(`${RADARR_URL}/api/v3/movie/${movieId}`, { headers: headers(), cache: 'no-store' });
    if (!res.ok) return;
    const movie = await res.json();
    const posterUrl =
      (movie.images as { coverType?: string; remoteUrl?: string }[] | undefined)?.find((i) => i.coverType === 'poster')?.remoteUrl ?? null;
    recordRequest({
      tmdbId: typeof movie.tmdbId === 'number' && movie.tmdbId > 0 ? movie.tmdbId : null,
      mediaType: 'movie',
      title: (movie.title as string) ?? `movie:${movieId}`,
      posterUrl,
      source: 'app',
    });
  } catch (err) {
    console.error('[requestLedger] failed to record movie search request:', err instanceof Error ? err.message : err);
  }
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

  const res = await fetchWithTimeout(`${RADARR_URL}/api/v3/queue?includeMovie=true&pageSize=50`, {
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

  const res = await fetchWithTimeout(`${RADARR_URL}/api/v3/manualimport?downloadId=${encodeURIComponent(downloadId)}`, {
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

  const cmdRes = await fetchWithTimeout(`${RADARR_URL}/api/v3/command`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'ManualImport', files: mappedFiles, importMode: 'auto' }),
  });
  if (!cmdRes.ok) throw new Error(await readableApiError(cmdRes, 'Radarr import command failed'));
  return { triggered: true };
}

export interface MissingMovie {
  movieId: number;
  title: string;
  year: number;
  hasPoster: boolean;
  releaseDate: string | null;
}

/** Monitored movies Radarr has no file for and no active download for - either not searched yet or genuinely unavailable on every configured indexer. Pulls straight from Radarr's own wanted/missing list. */
export async function getMissingMovies(): Promise<MissingMovie[]> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');
  const res = await fetchWithTimeout(
    `${RADARR_URL}/api/v3/wanted/missing?pageSize=1000&sortKey=releaseDate&sortDirection=descending`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Radarr wanted/missing failed: ${res.status}`);
  const data = await res.json();
  return (data.records as Record<string, unknown>[]).map((m) => {
    const images = (m.images as RadarrImage[] | undefined) ?? [];
    return {
      movieId: m.id as number,
      title: m.title as string,
      year: m.year as number,
      hasPoster: images.some((img) => img.coverType === 'poster'),
      releaseDate: (m.releaseDate as string | undefined) ?? null,
    };
  });
}

/** Same search Radarr's own UI triggers from the movie's own search icon. */
export async function searchRadarrMovie(movieId: number): Promise<void> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');
  const res = await fetchWithTimeout(`${RADARR_URL}/api/v3/command`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ name: 'MoviesSearch', movieIds: [movieId] }),
  });
  if (!res.ok) throw new Error(await readableApiError(res, 'Radarr movie search failed'));
}

export interface RadarrMovie {
  id: number;
  title: string;
  year: number;
  hasFile: boolean;
  sizeOnDisk: number;
  tmdbId: number;
  /** Radarr's own cached poster path (e.g. "/MediaCover/6/poster.jpg?lastWrite=..."), null if Radarr has none. Served through /api/radarr/image, never fetched directly - Radarr's LAN address isn't reachable from outside the network. */
  posterPath: string | null;
}

interface RadarrImage {
  coverType?: string;
  url?: string;
}

export async function getAllRadarrMovies(): Promise<RadarrMovie[]> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');
  const res = await fetchWithTimeout(`${RADARR_URL}/api/v3/movie`, { headers: headers(), cache: 'no-store' });
  if (!res.ok) throw new Error(`Radarr movie list failed: ${res.status}`);
  const data: Record<string, unknown>[] = await res.json();
  return data.map((m) => {
    const images = (m.images as RadarrImage[] | undefined) ?? [];
    return {
      id: m.id as number,
      title: m.title as string,
      year: m.year as number,
      hasFile: m.hasFile as boolean,
      sizeOnDisk: (m.sizeOnDisk as number) ?? 0,
      tmdbId: m.tmdbId as number,
      posterPath: images.find((img) => img.coverType === 'poster')?.url ?? null,
    };
  });
}

/** Removes the movie from Radarr entirely and deletes its file(s) from disk. */
export async function deleteRadarrMovie(movieId: number): Promise<void> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');
  try {
    const res = await fetchWithTimeout(`${RADARR_URL}/api/v3/movie/${movieId}?deleteFiles=true&addImportExclusion=false`, {
      method: 'DELETE',
      headers: headers(),
    });
    // 404 = the movie is already gone (deleted elsewhere, or a stale row) -
    // that IS the goal state, so it's success, not an error to show the user.
    if (!res.ok && res.status !== 404) throw new Error(await readableApiError(res, 'Radarr movie delete failed'));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    notifyAllChannels('Delete failed', `Radarr movie ${movieId}: ${message}`, 'alert').catch(() => {});
    throw err;
  }
  await deleteCachedPoster('radarr', movieId);
}

export interface ImportHistoryItem {
  /** History record id from Radarr/Sonarr - unique per event, used as the stable React key downstream. */
  historyId: number;
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

  // Over-fetch then filter then slice (mirrors the Sonarr twin) - history
  // pages mix grabs/deletes/renames with imports, so applying `limit` as the
  // page size BEFORE filtering let non-import events consume the whole page
  // and silently drop genuinely recent imports.
  const res = await fetchWithTimeout(
    `${RADARR_URL}/api/v3/history?page=1&pageSize=50&sortKey=date&sortDirection=descending&includeMovie=true`,
    { headers: headers(), cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`Radarr history failed: ${res.status}`);
  const data = await res.json();
  return (data.records ?? [])
    .filter((r: Record<string, unknown>) => (r.eventType as string) === 'downloadFolderImported')
    .slice(0, limit)
    .map((r: Record<string, unknown>) => ({
      historyId: r.id as number,
      title: (r.movie as { title?: string } | undefined)?.title ?? (r.sourceTitle as string | undefined) ?? 'Unknown',
      date: r.date as string,
      movieId: r.movieId as number,
    }));
}

export interface RadarrCalendarItem {
  movieId: number;
  title: string;
  /** TMDB id - lets the calendar link to the in-app detail page. */
  tmdbId: number | null;
  hasPoster: boolean;
  releaseDate: string;
  hasFile: boolean;
  monitored: boolean;
}

/** Every movie releasing in this date range - same data Radarr's own Calendar page shows. Uses whichever release date Radarr actually has (digital, then physical, then cinema), same fallback order Radarr's own UI uses. */
export async function getRadarrCalendar(start: string, end: string): Promise<RadarrCalendarItem[]> {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');
  const res = await fetchWithTimeout(`${RADARR_URL}/api/v3/calendar?start=${start}&end=${end}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`Radarr calendar failed: ${res.status}`);
  const data: Record<string, unknown>[] = await res.json();

  return data
    .map((m) => {
      const images = (m.images as { coverType?: string }[] | undefined) ?? [];
      const releaseDate = (m.digitalRelease ?? m.physicalRelease ?? m.inCinemas ?? m.releaseDate) as string | undefined;
      return releaseDate
        ? {
            movieId: m.id as number,
            title: m.title as string,
            tmdbId: typeof m.tmdbId === 'number' && m.tmdbId > 0 ? m.tmdbId : null,
            hasPoster: images.some((img) => img.coverType === 'poster'),
            releaseDate,
            hasFile: Boolean(m.hasFile),
            monitored: Boolean(m.monitored),
          }
        : null;
    })
    .filter((m): m is RadarrCalendarItem => m !== null);
}
