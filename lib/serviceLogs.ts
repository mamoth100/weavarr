import { fetchWithTimeout } from './fetchTimeout';
/**
 * Aggregated logging (Settings > Logs): pulls recent log entries from every
 * connected service that exposes them and normalizes to one shape so the UI
 * can render a single merged timeline.
 *
 * Coverage per service, dictated by what each one offers:
 * - Radarr / Sonarr: structured JSON via /api/v3/log
 * - NZBGet: structured JSON-RPC `log` method
 * - SABnzbd: warnings/errors only - its API exposes `mode=warnings`, not the
 *   full activity log
 * - Jellyfin: raw text of the newest server log file, parsed line by line
 * - Plex: ABSENT ON PURPOSE - Plex has no API to read its own logs (its only
 *   mechanism is a multi-megabyte diagnostics zip). Weavarr's own Plex
 *   interactions still log under the "weavarr" source.
 */
import { getLogs } from './logBuffer';
import { jellyfinEnabled, plexEnabled } from './mediaServer';

export type LogSource = 'weavarr' | 'radarr' | 'sonarr' | 'sabnzbd' | 'nzbget' | 'jellyfin';

export interface ServiceLogEntry {
  ts: string;
  level: 'log' | 'warn' | 'error';
  source: LogSource;
  message: string;
}

export interface SourceStatus {
  id: LogSource;
  ok: boolean;
  error?: string;
}

const MAX_PER_SOURCE = 100;
const MAX_MESSAGE = 2000;

function stripSlash(url: string | undefined): string | undefined {
  return url?.replace(/\/$/, '');
}

async function fetchArrLog(url: string, key: string, source: 'radarr' | 'sonarr'): Promise<ServiceLogEntry[]> {
  const res = await fetchWithTimeout(
    `${url}/api/v3/log?page=1&pageSize=${MAX_PER_SOURCE}&sortKey=time&sortDirection=descending`,
    { headers: { 'X-Api-Key': key }, cache: 'no-store' }
  );
  if (!res.ok) throw new Error(`log fetch failed: ${res.status}`);
  const data = await res.json();
  const records: { time?: string; level?: string; logger?: string; message?: string; exception?: string }[] =
    data.records ?? [];
  return records
    .filter((r) => r.time && r.message)
    .map((r) => ({
      ts: r.time as string,
      level: r.level === 'error' || r.level === 'fatal' ? 'error' : r.level === 'warn' ? 'warn' : 'log',
      source,
      message: `${r.logger ? `${r.logger}: ` : ''}${r.message}${r.exception ? ` - ${r.exception.split('\n')[0]}` : ''}`.slice(0, MAX_MESSAGE),
    }));
}

async function fetchNzbgetLog(): Promise<ServiceLogEntry[]> {
  const url = stripSlash(process.env.NZBGET_URL);
  const auth = `Basic ${Buffer.from(`${process.env.NZBGET_USERNAME}:${process.env.NZBGET_PASSWORD}`).toString('base64')}`;
  const res = await fetchWithTimeout(`${url}/jsonrpc`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ method: 'log', params: [0, MAX_PER_SOURCE] }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`log fetch failed: ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(data.error.message ?? 'log fetch failed');
  const entries: { Kind?: string; Time?: number; Text?: string }[] = data.result ?? [];
  return entries
    .filter((e) => e.Time && e.Text)
    .map((e) => ({
      ts: new Date((e.Time as number) * 1000).toISOString(),
      level: e.Kind === 'ERROR' ? 'error' : e.Kind === 'WARNING' ? 'warn' : 'log',
      source: 'nzbget' as const,
      message: (e.Text as string).slice(0, MAX_MESSAGE),
    }));
}

async function fetchSabnzbdLog(): Promise<ServiceLogEntry[]> {
  const url = stripSlash(process.env.SABNZBD_URL);
  const res = await fetchWithTimeout(`${url}/api?mode=warnings&output=json&apikey=${process.env.SABNZBD_API_KEY}`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`warnings fetch failed: ${res.status}`);
  const data = await res.json();
  const warnings: { text?: string; type?: string; time?: number }[] = data.warnings ?? [];
  return warnings
    .filter((w) => w.text && w.time)
    .map((w) => ({
      ts: new Date((w.time as number) * 1000).toISOString(),
      level: w.type === 'ERROR' ? ('error' as const) : ('warn' as const),
      source: 'sabnzbd' as const,
      message: (w.text as string).slice(0, MAX_MESSAGE),
    }));
}

// SAB's full-log line: 2026-08-16 15:30:39,062::DEBUG::[interface:145] message
const SAB_LINE = /^(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}),\d+::(\w+)::(?:\[.+?\]\s*)?(.*)$/;

/**
 * SABnzbd's complete log via `mode=showlog` - a multi-megabyte support
 * bundle (log + sanitized config), which is why this ONLY runs when the
 * user selects the SABnzbd chip instead of on every refresh. DEBUG lines
 * are dropped: SAB logs every incoming API poll at that level, which would
 * bury everything real.
 */
async function fetchSabnzbdFullLog(): Promise<ServiceLogEntry[]> {
  const url = stripSlash(process.env.SABNZBD_URL);
  const res = await fetchWithTimeout(`${url}/api?mode=showlog&apikey=${process.env.SABNZBD_API_KEY}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`showlog fetch failed: ${res.status}`);
  const text = await res.text();

  const entries: ServiceLogEntry[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(SAB_LINE);
    if (!m) continue;
    const [, ts, level, message] = m;
    if (level === 'DEBUG') continue;
    entries.push({
      // SAB logs in its server's local time with no offset - same box/tz as everything else here.
      ts: new Date(ts.replace(' ', 'T')).toISOString(),
      level: level === 'ERROR' ? 'error' : level === 'WARNING' ? 'warn' : 'log',
      source: 'sabnzbd',
      message: message.slice(0, MAX_MESSAGE),
    });
  }
  return entries.slice(-MAX_PER_SOURCE);
}

// Jellyfin log lines look like:
//   [2026-08-16 13:45:54.108 +00:00] [ERR] [95] Category.Name: the message
// Stack-trace continuation lines have no timestamp prefix and get appended
// to the entry they belong to.
const JELLYFIN_LINE = /^\[([0-9-]+ [0-9:.]+ [+-][0-9:]+)\] \[(\w+)\](?: \[\d+\])? (.*)$/;

async function fetchJellyfinLog(): Promise<ServiceLogEntry[]> {
  const url = stripSlash(process.env.JELLYFIN_URL);
  const headers = { 'X-Emby-Token': process.env.JELLYFIN_API_KEY as string, Accept: 'application/json' };
  const listRes = await fetchWithTimeout(`${url}/System/Logs`, { headers, cache: 'no-store' });
  if (!listRes.ok) throw new Error(`log list failed: ${listRes.status}`);
  const files: { Name?: string; DateModified?: string }[] = await listRes.json();
  const newest = files
    .filter((f) => f.Name?.startsWith('log_'))
    .sort((a, b) => (b.DateModified ?? '').localeCompare(a.DateModified ?? ''))[0];
  if (!newest?.Name) return [];

  const logRes = await fetchWithTimeout(`${url}/System/Logs/Log?name=${encodeURIComponent(newest.Name)}`, {
    headers,
    cache: 'no-store',
  });
  if (!logRes.ok) throw new Error(`log fetch failed: ${logRes.status}`);
  const text = await logRes.text();

  const entries: ServiceLogEntry[] = [];
  for (const line of text.split('\n')) {
    const m = line.match(JELLYFIN_LINE);
    if (m) {
      const [, ts, level, message] = m;
      entries.push({
        // "2026-08-16 13:45:54.108 +00:00" -> ISO the Date parser accepts
        ts: new Date(`${ts.slice(0, 10)}T${ts.slice(11).replace(' ', '')}`).toISOString(),
        level: level === 'ERR' || level === 'FTL' ? 'error' : level === 'WRN' ? 'warn' : 'log',
        source: 'jellyfin',
        message: message.slice(0, MAX_MESSAGE),
      });
    } else if (entries.length > 0 && line.trim()) {
      const last = entries[entries.length - 1];
      last.message = `${last.message}\n${line}`.slice(0, MAX_MESSAGE);
    }
  }
  return entries.slice(-MAX_PER_SOURCE);
}

function weavarrLog(): ServiceLogEntry[] {
  return getLogs()
    .slice(0, MAX_PER_SOURCE)
    .map((l) => ({ ts: l.ts, level: l.level, source: 'weavarr' as const, message: l.message }));
}

/**
 * Every enabled source's recent entries merged newest-first (up to 100 per
 * source, deliberately NO overall cap - a global cap silently hid quiet
 * sources whose newest entries were older than everyone else's), plus
 * per-source fetch status so the UI can say which panes are live.
 * `plexConfigured` lets the UI show Plex's explain-why-absent chip only when
 * Plex is actually in use. `sabFull` swaps SAB's always-cheap warnings feed
 * for its heavyweight full log - pass it only on demand.
 */
export async function getAggregatedLogs(sabFull = false): Promise<{ logs: ServiceLogEntry[]; sources: SourceStatus[]; plexConfigured: boolean }> {
  const radarrOn = process.env.ENABLE_RADARR !== 'false' && Boolean(process.env.RADARR_URL && process.env.RADARR_KEY);
  const sonarrOn = process.env.ENABLE_SONARR !== 'false' && Boolean(process.env.SONARR_URL && process.env.SONARR_KEY);
  const sabOn = process.env.ENABLE_SABNZBD !== 'false' && Boolean(process.env.SABNZBD_URL && process.env.SABNZBD_API_KEY);
  const nzbgetOn = process.env.ENABLE_NZBGET === 'true' && Boolean(process.env.NZBGET_URL && process.env.NZBGET_USERNAME);

  const jobs: { id: LogSource; run: () => Promise<ServiceLogEntry[]> }[] = [
    { id: 'weavarr', run: async () => weavarrLog() },
  ];
  if (radarrOn) jobs.push({ id: 'radarr', run: () => fetchArrLog(stripSlash(process.env.RADARR_URL)!, process.env.RADARR_KEY!, 'radarr') });
  if (sonarrOn) jobs.push({ id: 'sonarr', run: () => fetchArrLog(stripSlash(process.env.SONARR_URL)!, process.env.SONARR_KEY!, 'sonarr') });
  if (sabOn) jobs.push({ id: 'sabnzbd', run: sabFull ? fetchSabnzbdFullLog : fetchSabnzbdLog });
  if (nzbgetOn) jobs.push({ id: 'nzbget', run: fetchNzbgetLog });
  if (jellyfinEnabled()) jobs.push({ id: 'jellyfin', run: fetchJellyfinLog });

  const results = await Promise.allSettled(jobs.map((j) => j.run()));
  const logs: ServiceLogEntry[] = [];
  const sources: SourceStatus[] = [];
  results.forEach((r, i) => {
    if (r.status === 'fulfilled') {
      sources.push({ id: jobs[i].id, ok: true });
      logs.push(...r.value);
    } else {
      sources.push({ id: jobs[i].id, ok: false, error: r.reason instanceof Error ? r.reason.message : String(r.reason) });
    }
  });

  logs.sort((a, b) => b.ts.localeCompare(a.ts));
  return { logs, sources, plexConfigured: plexEnabled() };
}
