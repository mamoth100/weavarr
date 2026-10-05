/**
 * The "send this to whoever is helping you" zip: Settings > Logs > Download
 * support bundle. Everything a support thread asks for in its first three
 * replies (version, settings, which services answer, recent logs, jobs,
 * disk) in one file, built in memory on request.
 *
 * Nothing secret leaves. Secret settings are listed as set or not set, and
 * every saved secret value is scrubbed out of every text in the bundle,
 * since Radarr and friends happily print their own API key in a log line.
 */
import AdmZip from 'adm-zip';
import os from 'os';
import path from 'path';
import { existsSync } from 'fs';
import { readdir, stat, statfs } from 'fs/promises';
import { getSettingsStatus, getRawEnvValue, SETTINGS_SCHEMA } from './settings';
import { testGroup } from './connectionTests';
import { getLogs } from './logBuffer';
import { getAggregatedLogs } from './serviceLogs';
import { listJobs } from './jobs';
import { localCommit } from './versionCheck';

/** Groups whose test only reads from the service. Notification channels are left out: their test sends a message. */
const PROBE_GROUPS = ['TMDB', 'OMDb', 'Trakt', 'Radarr', 'Sonarr', 'SABnzbd', 'NZBGet', 'Plex', 'Jellyfin'];

const DATA_DIR = path.join(process.cwd(), 'data');

async function secretValues(): Promise<string[]> {
  const values = await Promise.all(SETTINGS_SCHEMA.filter((f) => f.secret).map((f) => getRawEnvValue(f.key).catch(() => null)));
  // Short values would blank out ordinary words; nothing that short is a real key anyway.
  return values.filter((v): v is string => typeof v === 'string' && v.trim().length >= 6).map((v) => v.trim());
}

function scrubber(secrets: string[]): (text: string) => string {
  return (text) => {
    let out = text;
    for (const s of secrets) out = out.split(s).join('[redacted]');
    // Belt and braces for keys that reach a log through a URL.
    return out.replace(/((?:api_?key|apikey|token|X-Api-Key)[=:]\s*)[A-Za-z0-9_-]{8,}/gi, '$1[redacted]');
  };
}

async function settingsText(): Promise<string> {
  const rows = await getSettingsStatus();
  const lines: string[] = [];
  let group = '';
  for (const r of rows) {
    if (r.group !== group) {
      group = r.group;
      lines.push('', `[${group}]`);
    }
    const value = r.secret ? (r.isSet ? '(set, hidden)' : '(not set)') : r.isSet ? r.value : r.defaultValue !== undefined ? `(not set, default ${r.defaultValue})` : '(not set)';
    lines.push(`${r.key} = ${value}`);
  }
  return lines.join('\n').trim() + '\n';
}

async function probeServices(): Promise<Record<string, { enabled: boolean; ok?: boolean; message?: string }>> {
  const out: Record<string, { enabled: boolean; ok?: boolean; message?: string }> = {};
  await Promise.all(
    PROBE_GROUPS.map(async (group) => {
      const fields = SETTINGS_SCHEMA.filter((f) => f.group === group);
      const values: Record<string, string> = {};
      for (const f of fields) {
        const raw = await getRawEnvValue(f.key).catch(() => null);
        if (raw) values[f.key] = raw;
      }
      const enableField = fields.find((f) => f.key.startsWith('ENABLE_'));
      const enabled = enableField ? (values[enableField.key] ?? enableField.defaultValue ?? 'false') === 'true' : true;
      if (!enabled) {
        out[group] = { enabled: false };
        return;
      }
      try {
        const r = await testGroup(group, values);
        out[group] = { enabled: true, ok: r.ok, message: r.message };
      } catch (err) {
        out[group] = { enabled: true, ok: false, message: err instanceof Error ? err.message : String(err) };
      }
    })
  );
  return out;
}

async function dataListing(): Promise<string> {
  const lines: string[] = [];
  async function walk(dir: string, rel: string, depth: number): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        // Caches hold thousands of files; the count says enough.
        if (depth >= 1 || e.name === 'image-cache' || e.name === 'posters') {
          const count = (await readdir(full).catch(() => [])).length;
          lines.push(`${rel}${e.name}/  (${count} entries)`);
        } else {
          lines.push(`${rel}${e.name}/`);
          await walk(full, `${rel}${e.name}/`, depth + 1);
        }
      } else {
        const s = await stat(full).catch(() => null);
        lines.push(`${rel}${e.name}  ${s ? s.size.toLocaleString() : '?'} bytes`);
      }
    }
  }
  await walk(DATA_DIR, '', 0);
  return lines.join('\n') + '\n';
}

async function systemInfo(): Promise<Record<string, unknown>> {
  let disk: Record<string, number> | null = null;
  try {
    const s = await statfs(DATA_DIR);
    disk = { freeBytes: s.bavail * s.bsize, totalBytes: s.blocks * s.bsize };
  } catch {}
  const mem = process.memoryUsage();
  return {
    generatedAt: new Date().toISOString(),
    commit: localCommit(),
    node: process.version,
    platform: `${process.platform} ${process.arch} (${os.release()})`,
    docker: existsSync('/.dockerenv'),
    uptimeSeconds: Math.round(process.uptime()),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    cpus: os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    freeMemoryBytes: os.freemem(),
    processRssBytes: mem.rss,
    heapUsedBytes: mem.heapUsed,
    dataDirectory: DATA_DIR,
    dataDisk: disk,
  };
}

const README = `Weavarr support bundle
======================

Built by Settings > Logs > Download support bundle. Share it with whoever
is helping you. It holds no passwords, keys or tokens: secret settings are
listed only as set or not set, and every saved secret value was removed
from every file here before the zip was made.

system.json          version, runtime, memory, disk space for the data folder
settings.txt         every setting and its value (secrets hidden)
services.json        whether each enabled service answered a connection test
jobs.json            every background job with its last outcome
logs/weavarr.log     the last few hundred lines of Weavarr's own log
logs/<service>.log   the last thousand entries from each connected service that exposes a log
                     (Radarr, Sonarr, SABnzbd, NZBGet, Jellyfin; Plex has no log API)
data-files.txt       what is in the data folder, names and sizes only
`;

export async function buildSupportBundle(): Promise<{ filename: string; buffer: Buffer }> {
  const [secrets, system, settings, services, jobs, serviceLogs, listing] = await Promise.all([
    secretValues(),
    systemInfo(),
    settingsText(),
    probeServices(),
    listJobs().catch(() => []),
    getAggregatedLogs(true, 1000).catch(() => ({ logs: [], sources: [], plexConfigured: false })),
    dataListing(),
  ]);
  const scrub = scrubber(secrets);
  const add = (name: string, text: string) => zip.addFile(name, Buffer.from(scrub(text), 'utf8'));

  const zip = new AdmZip();
  add('README.txt', README);
  add('system.json', JSON.stringify(system, null, 2));
  add('settings.txt', settings);
  add('services.json', JSON.stringify(services, null, 2));
  add('jobs.json', JSON.stringify(jobs, null, 2));
  add('logs/weavarr.log', getLogs().reverse().map((l) => `${l.ts} [${l.level}] ${l.message}`).join('\n') + '\n');
  const bySource = new Map<string, string[]>();
  for (const l of [...serviceLogs.logs].reverse()) {
    if (l.source === 'weavarr') continue;
    if (!bySource.has(l.source)) bySource.set(l.source, []);
    bySource.get(l.source)!.push(`${l.ts} [${l.level}] ${l.message}`);
  }
  for (const [source, lines] of Array.from(bySource)) add(`logs/${source}.log`, lines.join('\n') + '\n');
  const failed = serviceLogs.sources.filter((s) => !s.ok);
  if (failed.length > 0) add('logs/unavailable.txt', failed.map((s) => `${s.id}: ${s.error ?? 'failed'}`).join('\n') + '\n');
  add('data-files.txt', listing);

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
  return { filename: `weavarr-support-${stamp}.zip`, buffer: zip.toBuffer() };
}
