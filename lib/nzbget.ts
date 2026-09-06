import { fetchWithTimeout } from './fetchTimeout';
// Stripped of any trailing slash - see the same fix in lib/plex.ts for why.
const NZBGET_URL = process.env.NZBGET_URL?.replace(/\/$/, '');
const NZBGET_USERNAME = process.env.NZBGET_USERNAME;
const NZBGET_PASSWORD = process.env.NZBGET_PASSWORD;

// Defaults off (must be explicitly 'true') - a new opt-in download client, same convention as ENABLE_JELLYFIN.
export function nzbgetEnabled(): boolean {
  return process.env.ENABLE_NZBGET === 'true' && Boolean(NZBGET_URL && NZBGET_USERNAME && NZBGET_PASSWORD);
}

function authHeader(): string {
  return `Basic ${Buffer.from(`${NZBGET_USERNAME}:${NZBGET_PASSWORD}`).toString('base64')}`;
}

async function rpc<T>(method: string, params: unknown[] = []): Promise<T> {
  const res = await fetchWithTimeout(`${NZBGET_URL}/jsonrpc`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ method, params }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`NZBGet ${method} failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message ?? `NZBGet ${method} failed`);
  return data.result as T;
}

/** NZBGet has no plain "restart" RPC - "reload" is its restart: stop all activity, reread the config, relaunch the program. */
export async function restartNzbget(): Promise<void> {
  if (!nzbgetEnabled()) throw new Error('NZBGet is not configured');
  await rpc('reload');
}

// Field names mirror SABnzbd's queue shape (see lib/sabnzbd.ts) so
// lib/downloaders.ts can merge both into one combined queue.
export interface NzbgetSlot {
  filename: string;
  status: string;
  mb?: string;
  mbleft?: string;
  percentage?: string;
}

export interface NzbgetQueue {
  speedBps: number;
  mbleftTotal: number;
  noofslots: number;
  paused: boolean;
  slots: NzbgetSlot[];
}

interface NzbgetGroup {
  NZBName: string;
  FileSizeMB: number;
  RemainingSizeMB: number;
  ActiveDownloads: number;
  Status?: string;
}

interface NzbgetStatus {
  DownloadRate: number;
  RemainingSizeMB: number;
  DownloadPaused: boolean;
}

// NZBGet's own group Status values, humanized to match SABnzbd's wording.
// Anything not listed here (older API versions omit Status entirely, or a
// future version adds a new one) falls back to a title-cased rendering.
const STATUS_LABELS: Record<string, string> = {
  QUEUED: 'Queued',
  PAUSED: 'Paused',
  DOWNLOADING: 'Downloading',
  FETCHING: 'Fetching',
  PP_QUEUED: 'Waiting',
  LOADING_PARS: 'Checking',
  VERIFYING_SOURCES: 'Verifying',
  REPAIRING: 'Repairing',
  VERIFYING_REPAIRED: 'Verifying',
  RENAMING: 'Renaming',
  UNPACKING: 'Unpacking',
  MOVING: 'Moving',
};

function humanizeStatus(group: NzbgetGroup): string {
  if (group.Status) {
    return STATUS_LABELS[group.Status] ?? group.Status.toLowerCase().replace(/_/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return group.ActiveDownloads > 0 ? 'Downloading' : 'Queued';
}

export async function getNzbgetQueue(): Promise<NzbgetQueue> {
  if (!nzbgetEnabled()) throw new Error('NZBGet is not configured');

  const [status, groups] = await Promise.all([
    rpc<NzbgetStatus>('status'),
    rpc<NzbgetGroup[]>('listgroups'),
  ]);

  const slots: NzbgetSlot[] = groups.map((g) => ({
    filename: g.NZBName,
    status: humanizeStatus(g),
    mb: String(g.FileSizeMB),
    mbleft: String(g.RemainingSizeMB),
    percentage: g.FileSizeMB > 0
      ? String(Math.round(((g.FileSizeMB - g.RemainingSizeMB) / g.FileSizeMB) * 100))
      : undefined,
  }));

  return {
    speedBps: status.DownloadRate,
    mbleftTotal: status.RemainingSizeMB,
    noofslots: slots.length,
    paused: status.DownloadPaused,
    slots,
  };
}
