// Stripped of any trailing slash - see the same fix in lib/plex.ts for why.
const SAB_URL = process.env.SABNZBD_URL?.replace(/\/$/, '');
const SAB_KEY = process.env.SABNZBD_API_KEY;

// Defaults on (unset !== 'false') to preserve existing behavior from before
// this toggle existed - same convention as ENABLE_PLEX.
export function sabnzbdEnabled(): boolean {
  return process.env.ENABLE_SABNZBD !== 'false' && Boolean(SAB_URL && SAB_KEY);
}

export interface SabSlot {
  filename: string;
  status: string;
  // Only meaningful for active downloads - post-processing entries (from
  // history) don't have a download percentage, their status string already
  // carries its own progress (e.g. "Unpacking: 65/82 - 2:06 left").
  mb?: string;
  mbleft?: string;
  percentage?: string;
  timeleft?: string;
}

export interface SabQueue {
  speedBps: number;
  mbleftTotal: number;
  noofslots: number;
  paused: boolean;
  slots: SabSlot[];
}

function statusPriority(status: string): number {
  if (status === 'Downloading') return 0;
  if (status.startsWith('Unpacking') || ['Extracting', 'Verifying', 'Repairing', 'Moving', 'Running'].includes(status)) return 1;
  if (status === 'Waiting') return 2;
  if (status === 'Queued') return 3;
  return 4;
}

export async function getSabQueue(): Promise<SabQueue> {
  if (!SAB_URL || !SAB_KEY) throw new Error('SABnzbd is not configured');

  const [queueRes, historyRes] = await Promise.all([
    fetch(`${SAB_URL}/api?mode=queue&output=json&apikey=${SAB_KEY}`, { cache: 'no-store' }),
    fetch(`${SAB_URL}/api?mode=history&output=json&limit=15&apikey=${SAB_KEY}`, { cache: 'no-store' }),
  ]);
  if (!queueRes.ok) throw new Error(`SABnzbd queue failed: ${queueRes.status}`);
  if (!historyRes.ok) throw new Error(`SABnzbd history failed: ${historyRes.status}`);
  const data = await queueRes.json();
  const historyData = await historyRes.json();
  const q = data.queue;
  if (!q) throw new Error('SABnzbd returned an unexpected response');

  const queueSlots: SabSlot[] = (q.slots ?? []).map((s: Record<string, string>) => ({
    filename: s.filename,
    mb: s.mb,
    mbleft: s.mbleft,
    percentage: s.percentage,
    // SAB's own API reports "Downloading" for every queued slot, even ones
    // that haven't started - index 0 is the only one actually receiving
    // bytes. Anything else hasn't started downloading yet - it's Queued.
    status: Number(s.index) > 0 && s.status === 'Downloading' ? 'Queued' : s.status,
    timeleft: s.timeleft,
  }));

  // Once a download finishes, SAB moves it out of the queue entirely and
  // into history for post-processing (repair/extract/verify) - "Completed"
  // and "Failed" are both terminal/dead-end states (Radarr/Sonarr has
  // already moved on to trying something else) and not worth showing here.
  // SAB's own web UI displays its raw "Queued" history status as "Waiting"
  // - match that wording.
  const postProcessingSlots: SabSlot[] = (historyData.history?.slots ?? [])
    .filter((s: Record<string, unknown>) => s.status !== 'Completed' && s.status !== 'Failed')
    .map((s: Record<string, unknown>) => ({
      filename: s.name as string,
      status: (s.action_line as string) || (s.status === 'Queued' ? 'Waiting' : (s.status as string)),
    }));

  const slots = [...queueSlots, ...postProcessingSlots].sort(
    (a, b) => statusPriority(a.status) - statusPriority(b.status)
  );

  return {
    // SAB's own "speed" field is pre-formatted with a unit letter (e.g.
    // "1.2M") - "kbpersec" is the plain numeric value, needed to sum
    // against NZBGet's raw bytes/sec in lib/downloaders.ts.
    speedBps: parseFloat(q.kbpersec ?? '0') * 1024,
    mbleftTotal: parseFloat(q.mbleft ?? '0'),
    noofslots: slots.length,
    paused: !!q.paused,
    slots,
  };
}
