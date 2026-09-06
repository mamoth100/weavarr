import { fetchWithTimeout } from './fetchTimeout';

// A queue item that says "download completed" but never imported is stuck for
// good after this long: the classic causes (second grab of the same movie
// that's not an upgrade, or a completed folder cleaned up before import)
// never resolve themselves - Radarr/Sonarr retry and log errors forever,
// waiting for a human. Removing the queue ENTRY is bookkeeping only: no
// files are touched, nothing is blocklisted, and the release could still be
// grabbed again.
const STUCK_HOURS = 6;

interface QueueRecord {
  id: number;
  title?: string;
  status?: string;
  trackedDownloadState?: string;
  added?: string;
}

async function sweepQueue(name: 'radarr' | 'sonarr', url: string, key: string): Promise<void> {
  const headers = { 'X-Api-Key': key };
  const res = await fetchWithTimeout(`${url}/api/v3/queue?page=1&pageSize=100`, { headers, cache: 'no-store' });
  if (!res.ok) return;
  const data = await res.json();
  const cutoff = Date.now() - STUCK_HOURS * 60 * 60 * 1000;

  for (const r of (data.records ?? []) as QueueRecord[]) {
    if (r.status !== 'completed') continue;
    if (r.trackedDownloadState !== 'importPending' && r.trackedDownloadState !== 'importBlocked') continue;
    if (!r.added || new Date(r.added).getTime() > cutoff) continue;

    try {
      const del = await fetchWithTimeout(`${url}/api/v3/queue/${r.id}?removeFromClient=false&blocklist=false`, {
        method: 'DELETE',
        headers,
        cache: 'no-store',
      });
      if (del.ok) {
        console.log(`[queueJanitor] cleared stuck ${name} queue item "${r.title ?? r.id}" - completed but unimported for over ${STUCK_HOURS}h`);
      }
    } catch (err) {
      console.error(`[queueJanitor] failed to clear ${name} queue item ${r.id}:`, err instanceof Error ? err.message : err);
    }
  }
}

/** Hourly maintenance: silently clear queue debris that would otherwise error forever. Actions are visible in the Logs tab, no notifications by design. */
export async function sweepStuckQueueItems(): Promise<void> {
  const jobs: Promise<void>[] = [];
  if (process.env.ENABLE_RADARR !== 'false' && process.env.RADARR_URL && process.env.RADARR_KEY) {
    jobs.push(sweepQueue('radarr', process.env.RADARR_URL, process.env.RADARR_KEY));
  }
  if (process.env.ENABLE_SONARR !== 'false' && process.env.SONARR_URL && process.env.SONARR_KEY) {
    jobs.push(sweepQueue('sonarr', process.env.SONARR_URL, process.env.SONARR_KEY));
  }
  await Promise.allSettled(jobs);
}
