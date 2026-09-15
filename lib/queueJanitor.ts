import path from 'path';
import { fetchWithTimeout } from './fetchTimeout';
import { sonarrConfig } from './sonarr';
import { radarrConfig } from './radarr';
import { readJsonState, writeJsonAtomic } from './jsonState';

// A queue item that says "download completed" but never imported is stuck for
// good after this long: the classic causes (second grab of the same movie
// that's not an upgrade, a release with no usable video, or a completed
// folder cleaned up before import) never resolve themselves. Radarr/Sonarr
// re-check the item every minute and log an error each time, waiting for a
// human, and Sonarr will not search for the episode again while the item
// sits there. Removing the queue ENTRY is bookkeeping only: no files are
// touched, nothing is blocklisted, and the release could still be grabbed
// again.
const STUCK_HOURS = 6;

// Sonarr 4's queue rows carry no "added" time, and a download that SABnzbd
// picked up on its own has no grab in Sonarr's history either, so the only
// reliable clock is our own: when this janitor first saw the item stuck.
// Radarr does report "added" and that is used when present.
const STATE_FILE = path.join(process.cwd(), 'data', 'queue-janitor-state.json');
type FirstSeen = Record<string, string>;

interface QueueRecord {
  id: number;
  title?: string;
  status?: string;
  trackedDownloadState?: string;
  added?: string;
}

/** True for the states that never resolve on their own: finished but not imported, or failed and left behind. */
export function isStuck(r: QueueRecord): boolean {
  if (r.status === 'failed') return true;
  return r.status === 'completed' && (r.trackedDownloadState === 'importPending' || r.trackedDownloadState === 'importBlocked');
}

/**
 * Decides which stuck rows are old enough to clear, and returns the trimmed
 * first-seen map for the next run. Pure, so it can be tested without an arr.
 */
export function selectStuck(
  name: string,
  records: QueueRecord[],
  firstSeen: FirstSeen,
  now: number
): { toClear: QueueRecord[]; nextFirstSeen: FirstSeen } {
  const cutoff = now - STUCK_HOURS * 60 * 60 * 1000;
  const nextFirstSeen: FirstSeen = {};
  const toClear: QueueRecord[] = [];
  for (const r of records) {
    if (!isStuck(r)) continue;
    const key = `${name}:${r.id}`;
    const addedMs = r.added ? Date.parse(r.added) : NaN;
    const seenMs = Number.isFinite(addedMs) ? addedMs : Date.parse(firstSeen[key] ?? '') || now;
    nextFirstSeen[key] = new Date(seenMs).toISOString();
    if (seenMs <= cutoff) toClear.push(r);
  }
  return { toClear, nextFirstSeen };
}

async function sweepQueue(name: 'radarr' | 'sonarr', url: string, key: string, firstSeen: FirstSeen): Promise<FirstSeen> {
  const headers = { 'X-Api-Key': key };
  const res = await fetchWithTimeout(`${url.replace(/\/$/, '')}/api/v3/queue?page=1&pageSize=100`, { headers, cache: 'no-store' });
  if (!res.ok) {
    console.error(`[queueJanitor] ${name} queue listing failed: HTTP ${res.status}`);
    return firstSeen;
  }
  const data = await res.json();
  const { toClear, nextFirstSeen } = selectStuck(name, (data.records ?? []) as QueueRecord[], firstSeen, Date.now());

  for (const r of toClear) {
    try {
      const del = await fetchWithTimeout(`${url.replace(/\/$/, '')}/api/v3/queue/${r.id}?removeFromClient=false&blocklist=false`, {
        method: 'DELETE',
        headers,
        cache: 'no-store',
      });
      if (del.ok) {
        delete nextFirstSeen[`${name}:${r.id}`];
        console.log(`[queueJanitor] cleared stuck ${name} queue item "${r.title ?? r.id}": ${r.status} but unimported for over ${STUCK_HOURS}h`);
      } else {
        console.error(`[queueJanitor] ${name} refused to remove queue item ${r.id}: HTTP ${del.status}`);
      }
    } catch (err) {
      console.error(`[queueJanitor] failed to clear ${name} queue item ${r.id}:`, err instanceof Error ? err.message : err);
    }
  }
  return nextFirstSeen;
}

/** Hourly maintenance: silently clear queue debris that would otherwise error forever. Actions are visible in the Logs tab, no notifications by design. */
export async function sweepStuckQueueItems(): Promise<void> {
  const firstSeen = await readJsonState<FirstSeen>(STATE_FILE, {});
  const next: FirstSeen = {};
  const radarr = radarrConfig();
  const sonarr = sonarrConfig();
  const results = await Promise.allSettled([
    radarr ? sweepQueue('radarr', radarr.url, radarr.key, firstSeen) : Promise.resolve({}),
    sonarr ? sweepQueue('sonarr', sonarr.url, sonarr.key, firstSeen) : Promise.resolve({}),
  ]);
  for (const r of results) {
    if (r.status === 'fulfilled') Object.assign(next, r.value);
  }
  await writeJsonAtomic(STATE_FILE, next);
}
