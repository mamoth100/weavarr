/**
 * "Get a different version": the file plays badly, so swap it for another
 * release of the same title. Radarr and Sonarr both expose the interactive
 * search their own UIs use, plus a grab call for one specific release, and
 * marking the old grab as failed blocklists it so it never comes back.
 *
 * Order matters. Neither app will import a same-quality file over one that
 * still exists, so the old file has to go, but nothing is deleted until a
 * replacement has actually been grabbed: grab first, then delete, then
 * blocklist. A failed grab leaves everything as it was.
 */
import { fetchWithTimeout } from './fetchTimeout';
import { readableApiError } from './httpError';
import { radarrConfig, recordMovieSearchRequest } from './radarr';
import { sonarrConfig, assertSeriesDeletable, findSonarrEpisodeFile, recordEpisodeSearchRequest } from './sonarr';

export type ReplaceTarget =
  | { type: 'movie'; movieId: number }
  | { type: 'tv'; seriesId: number; seasonNumber: number; episodeNumber: number };

export interface ReleaseCandidate {
  guid: string;
  indexerId: number;
  indexer: string;
  title: string;
  size: number;
  quality: string;
  releaseGroup: string | null;
  protocol: 'usenet' | 'torrent';
  seeders: number | null;
  ageDays: number | null;
  /** Why the service would not pick this on its own, beyond "you already have one". Shown, not hidden: the user may know better. */
  warnings: string[];
}

export interface CurrentFile {
  title: string;
  releaseGroup: string | null;
  quality: string;
  size: number;
}

export interface ReplacementOptions {
  current: CurrentFile | null;
  candidates: ReleaseCandidate[];
}

/** The interactive search asks every indexer and waits for the slowest; the normal deadline is far too short for it. */
const SEARCH_TIMEOUT_MS = 90_000;

interface Service {
  url: string;
  key: string;
  name: 'Radarr' | 'Sonarr';
}

function service(target: ReplaceTarget): Service {
  const cfg = target.type === 'movie' ? radarrConfig() : sonarrConfig();
  if (!cfg) throw new Error(`${target.type === 'movie' ? 'Radarr' : 'Sonarr'} is not configured`);
  return { ...cfg, name: target.type === 'movie' ? 'Radarr' : 'Sonarr' };
}

function headers(s: Service) {
  return { 'X-Api-Key': s.key, 'Content-Type': 'application/json' };
}

async function resolveEpisode(target: Extract<ReplaceTarget, { type: 'tv' }>): Promise<{ episodeId: number; episodeFileId: number }> {
  const file = await findSonarrEpisodeFile(target.seriesId, target.seasonNumber, target.episodeNumber);
  if (!file) throw new Error('No file found for that episode');
  return file;
}

type Raw = Record<string, unknown>;

function qualityName(raw: Raw): string {
  return (raw.quality as { quality?: { name?: string } } | undefined)?.quality?.name ?? 'Unknown';
}

function groupOf(raw: Raw): string | null {
  return typeof raw.releaseGroup === 'string' && raw.releaseGroup.trim() ? raw.releaseGroup.trim() : null;
}

/** The file on disk now, as the service describes it. */
async function currentFile(s: Service, target: ReplaceTarget, episodeFileId?: number): Promise<{ file: CurrentFile; fileId: number } | null> {
  let raw: Raw | undefined;
  if (target.type === 'movie') {
    const res = await fetchWithTimeout(`${s.url}/api/v3/moviefile?movieId=${target.movieId}`, { headers: headers(s), cache: 'no-store' });
    if (!res.ok) throw new Error(await readableApiError(res, 'Radarr file lookup failed'));
    raw = ((await res.json()) as Raw[])[0];
  } else {
    const res = await fetchWithTimeout(`${s.url}/api/v3/episodefile/${episodeFileId}`, { headers: headers(s), cache: 'no-store' });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(await readableApiError(res, 'Sonarr file lookup failed'));
    raw = (await res.json()) as Raw;
  }
  if (!raw?.id) return null;
  const sceneName = typeof raw.sceneName === 'string' && raw.sceneName ? raw.sceneName : null;
  const fileName = typeof raw.relativePath === 'string' ? raw.relativePath.split(/[\\/]/).pop() ?? '' : '';
  return {
    fileId: raw.id as number,
    file: {
      title: sceneName ?? fileName,
      releaseGroup: groupOf(raw),
      quality: qualityName(raw),
      size: typeof raw.size === 'number' ? raw.size : 0,
    },
  };
}

/** The most recent grab in the service's history for this title: what to blocklist. */
async function lastGrab(s: Service, target: ReplaceTarget, episodeId?: number): Promise<{ id: number; sourceTitle: string } | null> {
  const url = target.type === 'movie'
    ? `${s.url}/api/v3/history/movie?movieId=${target.movieId}&eventType=1`
    : `${s.url}/api/v3/history?episodeId=${episodeId}&eventType=1&pageSize=20&sortKey=date&sortDirection=descending`;
  const res = await fetchWithTimeout(url, { headers: headers(s), cache: 'no-store' });
  if (!res.ok) return null;
  const data = await res.json();
  const records: Raw[] = Array.isArray(data) ? data : ((data as Raw).records as Raw[]) ?? [];
  const grab = records
    .filter((r) => r.eventType === 'grabbed')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  return grab ? { id: grab.id as number, sourceTitle: String(grab.sourceTitle ?? '') } : null;
}

/** Rejections that only say "you already have this quality" are the point of the exercise, not a reason to flag a candidate. */
const EXPECTED_REJECTION = /upgrade|cutoff|existing file|already/i;

async function interactiveSearch(s: Service, query: string): Promise<Raw[]> {
  let res: Response;
  try {
    res = await fetch(`${s.url}/api/v3/release?${query}`, {
      headers: headers(s),
      cache: 'no-store',
      signal: AbortSignal.timeout(SEARCH_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === 'TimeoutError') throw new Error(`${s.name} did not finish searching within ${SEARCH_TIMEOUT_MS / 1000}s`);
    throw err;
  }
  if (!res.ok) throw new Error(await readableApiError(res, `${s.name} release search failed`));
  return (await res.json()) as Raw[];
}

export async function listReplacementOptions(target: ReplaceTarget): Promise<ReplacementOptions> {
  const s = service(target);
  const episode = target.type === 'tv' ? await resolveEpisode(target) : null;
  const [cur, grab, releases] = await Promise.all([
    currentFile(s, target, episode?.episodeFileId),
    lastGrab(s, target, episode?.episodeId),
    interactiveSearch(s, target.type === 'movie' ? `movieId=${target.movieId}` : `episodeId=${episode!.episodeId}`),
  ]);

  const sameGroup = cur?.file.releaseGroup?.toLowerCase() ?? null;
  const haveTitles = new Set([cur?.file.title, grab?.sourceTitle].filter(Boolean).map((t) => String(t).toLowerCase()));
  const ranked: { c: ReleaseCandidate; weight: number; score: number }[] = [];
  for (const r of releases) {
    const title = String(r.title ?? '');
    if (haveTitles.has(title.toLowerCase())) continue;
    const group = groupOf(r);
    // Same group, same encode, same problem.
    if (sameGroup && group?.toLowerCase() === sameGroup) continue;
    ranked.push({
      c: {
        guid: String(r.guid),
        indexerId: Number(r.indexerId),
        indexer: String(r.indexer ?? ''),
        title,
        size: typeof r.size === 'number' ? r.size : 0,
        quality: qualityName(r),
        releaseGroup: group,
        protocol: r.protocol === 'torrent' ? 'torrent' : 'usenet',
        seeders: typeof r.seeders === 'number' ? r.seeders : null,
        ageDays: typeof r.age === 'number' ? r.age : null,
        warnings: ((r.rejections as string[] | undefined) ?? []).filter((x) => !EXPECTED_REJECTION.test(x)),
      },
      weight: Number(r.qualityWeight ?? 0),
      score: Number(r.customFormatScore ?? 0),
    });
  }
  // The service's own order: clean candidates first, then its quality and
  // custom format ranking, then the most seeders, then the newest.
  ranked.sort((a, b) =>
    (a.c.warnings.length === 0 ? 0 : 1) - (b.c.warnings.length === 0 ? 0 : 1)
    || b.weight - a.weight
    || b.score - a.score
    || (b.c.seeders ?? 0) - (a.c.seeders ?? 0)
    || (a.c.ageDays ?? 0) - (b.c.ageDays ?? 0)
  );
  return { current: cur?.file ?? null, candidates: ranked.map((r) => r.c) };
}

/** Grabs the chosen release, then removes the current file and blocklists the grab it came from. */
export async function replaceWithRelease(target: ReplaceTarget, guid: string, indexerId: number): Promise<void> {
  const s = service(target);
  if (target.type === 'tv') await assertSeriesDeletable(target.seriesId);
  const episode = target.type === 'tv' ? await resolveEpisode(target) : null;
  const [cur, grab] = await Promise.all([currentFile(s, target, episode?.episodeFileId), lastGrab(s, target, episode?.episodeId)]);

  const grabRes = await fetchWithTimeout(`${s.url}/api/v3/release`, {
    method: 'POST',
    headers: headers(s),
    body: JSON.stringify({ guid, indexerId }),
  });
  if (!grabRes.ok) throw new Error(await readableApiError(grabRes, `${s.name} could not grab that release`));

  // From here on the new download is on its way; the old file goes so the
  // import is not refused as "not an upgrade".
  if (cur) {
    const path = target.type === 'movie' ? `moviefile/${cur.fileId}` : `episodefile/${cur.fileId}`;
    const del = await fetchWithTimeout(`${s.url}/api/v3/${path}`, { method: 'DELETE', headers: headers(s) });
    if (!del.ok && del.status !== 404) throw new Error(await readableApiError(del, `Grabbed, but ${s.name} could not delete the old file`));
  }
  if (grab) {
    // Marking the grab failed is how the service blocklists a release.
    await fetchWithTimeout(`${s.url}/api/v3/history/failed/${grab.id}`, { method: 'POST', headers: headers(s) }).catch(() => {});
  }
  // So the Requests page and the progress pill follow the new download.
  if (target.type === 'movie') await recordMovieSearchRequest(target.movieId).catch(() => {});
  else if (episode) await recordEpisodeSearchRequest(target.seriesId, [episode.episodeId]).catch(() => {});
}
