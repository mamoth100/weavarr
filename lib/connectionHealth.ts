import { readJsonState, writeJsonAtomic } from './jsonState';
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
  // ENABLE_* checked like every other entry here - Settings never clears the
  // URL/key when a service is toggled off, so without the flag check a
  // deliberately disabled (and stopped) Radarr/Sonarr still got health-checked
  // and fired "connection dropped" alerts for a service the user turned off.
  {
    name: 'Radarr',
    configured: () => process.env.ENABLE_RADARR !== 'false' && Boolean(process.env.RADARR_URL && process.env.RADARR_KEY),
    values: () => ({ RADARR_URL: process.env.RADARR_URL ?? '', RADARR_KEY: process.env.RADARR_KEY ?? '' }),
  },
  {
    name: 'Sonarr',
    configured: () => process.env.ENABLE_SONARR !== 'false' && Boolean(process.env.SONARR_URL && process.env.SONARR_KEY),
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
  lastStatus = await readJsonState<Record<string, boolean>>(STATE_FILE, {});
  return lastStatus;
}

async function persistStatus(): Promise<void> {
  if (!lastStatus) return;
  await writeJsonAtomic(STATE_FILE, lastStatus);
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
        'alert',
        '/status'
      ).catch(() => {});
    }

    if (status[group.name] !== result.ok) {
      status[group.name] = result.ok;
      changed = true;
    }
  }

  if (changed) await persistStatus();
}
