const SAB_URL = process.env.SABNZBD_URL;
const SAB_KEY = process.env.SABNZBD_API_KEY;

export interface SabSlot {
  filename: string;
  status: string;
  // Only meaningful for active downloads — post-processing entries (from
  // history) don't have a download percentage, their status string already
  // carries its own progress (e.g. "Unpacking: 65/82 - 2:06 left").
  mb?: string;
  mbleft?: string;
  percentage?: string;
  timeleft?: string;
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
    // that haven't started — index 0 is the only one actually receiving
    // bytes. Anything else is really just waiting its turn.
    status: Number(s.index) > 0 && s.status === 'Downloading' ? 'Waiting' : s.status,
    timeleft: s.timeleft,
  }));

  // Once a download finishes, SAB moves it out of the queue entirely and
  // into history for post-processing (repair/extract/verify) — "Completed"
  // entries are done and not worth showing here.
  const postProcessingSlots: SabSlot[] = (historyData.history?.slots ?? [])
    .filter((s: Record<string, unknown>) => s.status !== 'Completed')
    .map((s: Record<string, unknown>) => ({
      filename: s.name as string,
      status: (s.action_line as string) || (s.status as string),
    }));

  const slots = [...queueSlots, ...postProcessingSlots];

  return {
    speed: q.speed ?? '0',
    mbleft: q.mbleft ?? '0',
    noofslots: slots.length,
    paused: !!q.paused,
    slots,
  };
}
