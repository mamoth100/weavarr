import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { testGroup } from './connectionTests';
import { plexEnabled, jellyfinEnabled } from './mediaServer';
import { sabnzbdEnabled } from './sabnzbd';
import { nzbgetEnabled } from './nzbget';
import { notifyAllChannels } from './notificationChannels';

const STATE_FILE = path.join(process.cwd(), 'data', 'connection-health.json');

interface MonitoredGroup {
  name: string;
  configured: () => boolean;
  values: () => Record<string, string>;
}

const MONITORED_GROUPS: MonitoredGroup[] = [
  {
    name: 'Radarr',
    configured: () => Boolean(process.env.RADARR_URL && process.env.RADARR_KEY),
    values: () => ({ RADARR_URL: process.env.RADARR_URL ?? '', RADARR_KEY: process.env.RADARR_KEY ?? '' }),
  },
  {
    name: 'Sonarr',
    configured: () => Boolean(process.env.SONARR_URL && process.env.SONARR_KEY),
    values: () => ({ SONARR_URL: process.env.SONARR_URL ?? '', SONARR_KEY: process.env.SONARR_KEY ?? '' }),
  },
  {
    name: 'SABnzbd',
    configured: sabnzbdEnabled,
    values: () => ({ SABNZBD_URL: process.env.SABNZBD_URL ?? '', SABNZBD_API_KEY: process.env.SABNZBD_API_KEY ?? '' }),
  },
  {
    name: 'NZBGet',
    configured: nzbgetEnabled,
    values: () => ({
      NZBGET_URL: process.env.NZBGET_URL ?? '',
      NZBGET_USERNAME: process.env.NZBGET_USERNAME ?? '',
      NZBGET_PASSWORD: process.env.NZBGET_PASSWORD ?? '',
    }),
  },
  {
    name: 'Plex',
    configured: plexEnabled,
    values: () => ({ PLEX_URL: process.env.PLEX_URL ?? '', PLEX_TOKEN: process.env.PLEX_TOKEN ?? '' }),
  },
  {
    name: 'Jellyfin',
    configured: jellyfinEnabled,
    values: () => ({
      JELLYFIN_URL: process.env.JELLYFIN_URL ?? '',
      JELLYFIN_API_KEY: process.env.JELLYFIN_API_KEY ?? '',
      JELLYFIN_USER_ID: process.env.JELLYFIN_USER_ID ?? '',
    }),
  },
];

// Keyed by group name -> was it reachable on the last check. Only alerts on
// the healthy-to-unhealthy transition, not every poll a connection stays
// down, otherwise a multi-hour outage would spam one alert per interval.
let lastStatus: Record<string, boolean> | null = null;

async function loadStatus(): Promise<Record<string, boolean>> {
  if (lastStatus) return lastStatus;
  try {
    lastStatus = JSON.parse(await readFile(STATE_FILE, 'utf8'));
  } catch {
    lastStatus = {};
  }
  return lastStatus as Record<string, boolean>;
}

async function persistStatus(): Promise<void> {
  if (!lastStatus) return;
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(lastStatus), 'utf8');
}

export async function checkConnectionHealth(): Promise<void> {
  const status = await loadStatus();
  let changed = false;

  for (const group of MONITORED_GROUPS) {
    if (!group.configured()) continue;

    const result = await testGroup(group.name, group.values()).catch((err) => ({
      ok: false,
      message: err instanceof Error ? err.message : String(err),
    }));

    const wasHealthy = status[group.name] ?? true; // assume healthy on first-ever check, don't alert about it
    if (wasHealthy && !result.ok) {
      notifyAllChannels(
        'Connection dropped',
        `${group.name} is unreachable: ${result.message}`,
        'alert'
      ).catch(() => {});
    }

    if (status[group.name] !== result.ok) {
      status[group.name] = result.ok;
      changed = true;
    }
  }

  if (changed) await persistStatus();
}
