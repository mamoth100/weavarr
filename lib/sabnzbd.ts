const SAB_URL = process.env.SABNZBD_URL;
const SAB_KEY = process.env.SABNZBD_API_KEY;

export interface SabSlot {
  filename: string;
  mb: string;
  mbleft: string;
  percentage: string;
  status: string;
  timeleft: string;
}

export interface SabQueue {
  speed: string;
  mbleft: string;
  noofslots: number;
  paused: boolean;
  slots: SabSlot[];
}

export async function getSabQueue(): Promise<SabQueue> {
  if (!SAB_URL || !SAB_KEY) throw new Error('SABnzbd is not configured');

  const res = await fetch(`${SAB_URL}/api?mode=queue&output=json&apikey=${SAB_KEY}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`SABnzbd queue failed: ${res.status}`);
  const data = await res.json();
  const q = data.queue;
  if (!q) throw new Error('SABnzbd returned an unexpected response');

  return {
    speed: q.speed ?? '0',
    mbleft: q.mbleft ?? '0',
    noofslots: q.noofslots_total ?? q.slots?.length ?? 0,
    paused: !!q.paused,
    slots: (q.slots ?? []).map((s: Record<string, string>) => ({
      filename: s.filename,
      mb: s.mb,
      mbleft: s.mbleft,
      percentage: s.percentage,
      // SAB's own API reports "Downloading" for every queued slot, even ones
      // that haven't started — index 0 is the only one actually receiving
      // bytes. Anything else is really just waiting its turn.
      status: Number(s.index) > 0 && s.status === 'Downloading' ? 'Waiting' : s.status,
      timeleft: s.timeleft,
    })),
  };
}
