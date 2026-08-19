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
  movie?: { tmdbId?: number };
  series?: { tmdbId?: number };
}

function aggregate(records: QueueRecordShape[], pick: (r: QueueRecordShape) => number | undefined): Record<number, TitleProgress> {
  const byId = new Map<number, { size: number; left: number; importing: boolean; active: boolean }>();
  for (const r of records) {
    const tmdbId = pick(r);
    if (!tmdbId) continue;
    const entry = byId.get(tmdbId) ?? { size: 0, left: 0, importing: false, active: false };
    entry.size += r.size ?? 0;
    entry.left += r.sizeleft ?? 0;
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
  const res = await fetch(url, { headers: { 'X-Api-Key': key }, cache: 'no-store' });
  if (!res.ok) throw new Error(`queue failed: ${res.status}`);
  const data = await res.json();
  return data.records ?? [];
}

export async function getDownloadProgress(): Promise<DownloadProgressMap> {
  const radarrOn = process.env.ENABLE_RADARR !== 'false' && Boolean(process.env.RADARR_URL && process.env.RADARR_KEY);
  const sonarrOn = process.env.ENABLE_SONARR !== 'false' && Boolean(process.env.SONARR_URL && process.env.SONARR_KEY);

  const [radarr, sonarr] = await Promise.allSettled([
    radarrOn
      ? fetchQueue(`${process.env.RADARR_URL!.replace(/\/$/, '')}/api/v3/queue?includeMovie=true&pageSize=100`, process.env.RADARR_KEY!)
      : Promise.resolve([]),
    sonarrOn
      ? fetchQueue(`${process.env.SONARR_URL!.replace(/\/$/, '')}/api/v3/queue?includeSeries=true&pageSize=100`, process.env.SONARR_KEY!)
      : Promise.resolve([]),
  ]);

  return {
    movies: aggregate(radarr.status === 'fulfilled' ? radarr.value : [], (r) => r.movie?.tmdbId),
    shows: aggregate(sonarr.status === 'fulfilled' ? sonarr.value : [], (r) => r.series?.tmdbId),
  };
}
