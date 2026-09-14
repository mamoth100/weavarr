import { fetchWithTimeout } from './fetchTimeout';
import { sonarrConfig } from './sonarr';
import { radarrConfig } from './radarr';
import { sabnzbdConfig } from './sabnzbd';
import { nzbgetConfig } from './nzbget';
/**
 * Per-title download progress, keyed by TMDB id so browse cards and detail
 * pages can match it to what they're showing. Aggregates the Radarr/Sonarr
 * queues (a season download is many queue rows - sizes are summed so the
 * percent reflects the whole grab).
 */

export interface TitleProgress {
  /** 0-100, whole-title (all queue rows for it combined). */
  percent: number;
  state: 'queued' | 'downloading' | 'importing';
}

export interface DownloadProgressMap {
  movies: Record<number, TitleProgress>;
  shows: Record<number, TitleProgress>;
}

interface QueueRecordShape {
  size?: number;
  sizeleft?: number;
  status?: string;
  trackedDownloadState?: string;
  downloadId?: string;
  episodeId?: number;
  movie?: { tmdbId?: number };
  series?: { tmdbId?: number };
}

/**
 * Live completion fractions straight from the download clients, keyed by the
 * downloadId Radarr/Sonarr store (SAB nzo_id / NZBGet id). Radarr and Sonarr
 * only refresh their own queue numbers about once a minute, which made card
 * percents lag the Status page badly - the arr queues stay the source of
 * IDENTITY (which download is which title), the clients the source of BYTES.
 */
async function fetchClientFractions(): Promise<Map<string, number>> {
  const map = new Map<string, number>();

  const sab = sabnzbdConfig();
  const nzb = nzbgetConfig();

  const [sabResult, nzbget] = await Promise.allSettled([
    sab
      ? fetchWithTimeout(`${sab.url}/api?mode=queue&output=json&apikey=${sab.key}`, { cache: 'no-store' }).then((r) => r.json())
      : Promise.resolve(null),
    nzb
      ? fetchWithTimeout(`${nzb.url}/jsonrpc`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${nzb.username}:${nzb.password}`).toString('base64')}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ method: 'listgroups', params: [] }),
          cache: 'no-store',
        }).then((r) => r.json())
      : Promise.resolve(null),
  ]);

  if (sabResult.status === 'fulfilled' && sabResult.value) {
    for (const slot of sabResult.value.queue?.slots ?? []) {
      const mb = parseFloat(slot.mb);
      const mbleft = parseFloat(slot.mbleft);
      if (slot.nzo_id && mb > 0 && !isNaN(mbleft)) {
        map.set(String(slot.nzo_id).toLowerCase(), Math.max(0, Math.min(1, (mb - mbleft) / mb)));
      }
    }
  }
  if (nzbget.status === 'fulfilled' && nzbget.value) {
    for (const g of nzbget.value.result ?? []) {
      const size = g.FileSizeMB;
      const left = g.RemainingSizeMB;
      if (!(size > 0) || typeof left !== 'number') continue;
      const frac = Math.max(0, Math.min(1, (size - left) / size));
      // Radarr/Sonarr's downloadId for NZBGet is NOT the NZBID - it's the
      // GUID they attach as the "drone" parameter (verified live 2026-08-18:
      // downloadId 313d8f8b... vs NZBID 2, drone param carried the GUID).
      const drone = (g.Parameters ?? []).find((p: { Name?: string }) => (p.Name ?? '').toLowerCase() === 'drone');
      if (drone?.Value) map.set(String(drone.Value).toLowerCase(), frac);
      if (g.NZBID) map.set(String(g.NZBID).toLowerCase(), frac);
    }
  }
  return map;
}

function aggregate(
  records: QueueRecordShape[],
  pick: (r: QueueRecordShape) => number | undefined,
  clientFractions: Map<string, number>
): Record<number, TitleProgress> {
  const byId = new Map<number, { size: number; left: number; importing: boolean; active: boolean }>();
  for (const r of records) {
    const tmdbId = pick(r);
    if (!tmdbId) continue;
    const entry = byId.get(tmdbId) ?? { size: 0, left: 0, importing: false, active: false };
    const size = r.size ?? 0;
    // Prefer the download client's live fraction over the arr's stale sizeleft.
    const clientFrac = r.downloadId ? clientFractions.get(r.downloadId.toLowerCase()) : undefined;
    entry.size += size;
    entry.left += clientFrac !== undefined ? size * (1 - clientFrac) : r.sizeleft ?? 0;
    if ((r.trackedDownloadState ?? '').startsWith('import')) entry.importing = true;
    if (r.status === 'downloading') entry.active = true;
    byId.set(tmdbId, entry);
  }
  const out: Record<number, TitleProgress> = {};
  byId.forEach((e, tmdbId) => {
    out[tmdbId] = {
      percent: e.size > 0 ? Math.min(100, Math.round(((e.size - e.left) / e.size) * 100)) : 0,
      state: e.importing ? 'importing' : e.active ? 'downloading' : 'queued',
    };
  });
  return out;
}

async function fetchQueue(url: string, key: string): Promise<QueueRecordShape[]> {
  const res = await fetchWithTimeout(url, { headers: { 'X-Api-Key': key }, cache: 'no-store' });
  if (!res.ok) throw new Error(`queue failed: ${res.status}`);
  const data = await res.json();
  return data.records ?? [];
}

/**
 * Per-EPISODE progress, keyed by Sonarr episodeId - the missing-episodes
 * section needs to know which specific episodes moved past "searching" into
 * an actual grab. Same identity-from-arr, bytes-from-client split as the
 * per-title map. A season pack shows the pack's overall progress on each of
 * its episodes, which is what the pack genuinely is.
 */
export async function getEpisodeDownloadProgress(): Promise<Record<number, TitleProgress>> {
  const sonarr = sonarrConfig();
  if (!sonarr) return {};
  const [records, clientFractions] = await Promise.all([
    fetchQueue(`${sonarr.url}/api/v3/queue?pageSize=200`, sonarr.key).catch(() => []),
    fetchClientFractions(),
  ]);
  const out: Record<number, TitleProgress> = {};
  for (const r of records) {
    if (!r.episodeId) continue;
    const size = r.size ?? 0;
    const clientFrac = r.downloadId ? clientFractions.get(r.downloadId.toLowerCase()) : undefined;
    const left = clientFrac !== undefined ? size * (1 - clientFrac) : r.sizeleft ?? 0;
    out[r.episodeId] = {
      percent: size > 0 ? Math.min(100, Math.round(((size - left) / size) * 100)) : 0,
      state: (r.trackedDownloadState ?? '').startsWith('import') ? 'importing' : r.status === 'downloading' ? 'downloading' : 'queued',
    };
  }
  return out;
}

export async function getDownloadProgress(): Promise<DownloadProgressMap> {
  const radarrCfg = radarrConfig();
  const sonarrCfg = sonarrConfig();

  const [radarr, sonarr, clientFractions] = await Promise.all([
    radarrCfg
      ? fetchQueue(`${radarrCfg.url}/api/v3/queue?includeMovie=true&pageSize=100`, radarrCfg.key).catch(() => [])
      : Promise.resolve([]),
    sonarrCfg
      ? fetchQueue(`${sonarrCfg.url}/api/v3/queue?includeSeries=true&pageSize=100`, sonarrCfg.key).catch(() => [])
      : Promise.resolve([]),
    fetchClientFractions().catch(() => new Map<string, number>()),
  ]);

  return {
    movies: aggregate(radarr, (r) => r.movie?.tmdbId, clientFractions),
    shows: aggregate(sonarr, (r) => r.series?.tmdbId, clientFractions),
  };
}
