/**
 * Merges SABnzbd and NZBGet into a single combined download queue, the same
 * way lib/mediaServer.ts merges Plex and Jellyfin - one function every
 * consumer calls regardless of which client(s) are enabled. Unlike the media
 * server merge, each item keeps a "source" tag so the UI can show which
 * client is actually handling it.
 */
import { getSabQueue, sabnzbdEnabled, type SabSlot } from './sabnzbd';
import { getNzbgetQueue, nzbgetEnabled } from './nzbget';

export type DownloaderSource = 'SABnzbd' | 'NZBGet';

// NzbgetSlot's fields are a subset of SabSlot's (both share the same shape
// by convention - see lib/nzbget.ts), so a tagged NzbgetSlot fits here too.
export interface DownloadSlot extends SabSlot {
  source: DownloaderSource;
}

export interface DownloaderQueue {
  speedBps: number;
  mbleft: number;
  noofslots: number;
  paused: boolean;
  slots: DownloadSlot[];
  /** Per-client failures when at least one other client answered; with both enabled and NZBGet down, the queue is SAB's and this says why NZBGet is missing. */
  errors: Partial<Record<DownloaderSource, string>>;
}

export function downloadersEnabled(): boolean {
  return sabnzbdEnabled() || nzbgetEnabled();
}

export async function getDownloaderQueue(): Promise<DownloaderQueue> {
  const sources: { name: DownloaderSource; fn: () => Promise<{ speedBps: number; mbleftTotal: number; noofslots: number; paused: boolean; slots: SabSlot[] }> }[] = [];
  if (sabnzbdEnabled()) sources.push({ name: 'SABnzbd', fn: getSabQueue });
  if (nzbgetEnabled()) sources.push({ name: 'NZBGet', fn: getNzbgetQueue });
  if (sources.length === 0) throw new Error('No downloader is configured');

  const settled = await Promise.allSettled(sources.map((s) => s.fn()));
  const fulfilled = sources
    .map((s, i) => ({ name: s.name, result: settled[i] }))
    .filter((r): r is { name: DownloaderSource; result: PromiseFulfilledResult<Awaited<ReturnType<typeof getSabQueue>>> } => r.result.status === 'fulfilled');

  if (fulfilled.length === 0) {
    const first = settled[0];
    const reason = first.status === 'rejected' ? first.reason : undefined;
    throw reason instanceof Error ? reason : new Error(String(reason ?? 'All downloaders failed'));
  }

  const errors: Partial<Record<DownloaderSource, string>> = {};
  sources.forEach((s, i) => {
    const r = settled[i];
    if (r.status === 'rejected') errors[s.name] = r.reason instanceof Error ? r.reason.message : String(r.reason);
  });

  let speedBps = 0;
  let mbleft = 0;
  let noofslots = 0;
  // Only "Paused" overall if every enabled client that responded is paused -
  // one active client means downloads are still moving.
  let paused = true;
  const slots: DownloadSlot[] = [];

  for (const { name, result } of fulfilled) {
    const q = result.value;
    speedBps += q.speedBps;
    mbleft += q.mbleftTotal;
    noofslots += q.noofslots;
    if (!q.paused) paused = false;
    slots.push(...q.slots.map((s) => ({ ...s, source: name })));
  }

  return { speedBps, mbleft, noofslots, paused, slots, errors };
}
