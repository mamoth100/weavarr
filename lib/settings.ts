import { mkdir, readFile, writeFile, readdir, unlink } from 'fs/promises';
import path from 'path';

const ENV_FILE = path.join(process.cwd(), '.env.local');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'env-backups');
const MAX_BACKUPS = 10;

export interface SettingField {
  key: string;
  label: string;
  group: string;
  secret: boolean; // if true, never echo the actual value back to the client
}

export const SETTINGS_SCHEMA: SettingField[] = [
  { key: 'TMDB_TOKEN', label: 'TMDB Read Access Token', group: 'TMDB', secret: true },
  { key: 'TMDB_API_KEY', label: 'TMDB API Key', group: 'TMDB', secret: true },
  { key: 'OMDB_API_KEY', label: 'OMDb API Key', group: 'OMDb', secret: true },
  { key: 'TRAKT_CLIENT_ID', label: 'Trakt Client ID (server)', group: 'Trakt', secret: true },
  { key: 'NEXT_PUBLIC_TRAKT_CLIENT_ID', label: 'Trakt Client ID (public)', group: 'Trakt', secret: false },
  { key: 'NEXT_PUBLIC_SUPABASE_URL', label: 'Supabase URL', group: 'Supabase', secret: false },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', label: 'Supabase Anon Key', group: 'Supabase', secret: false },
  { key: 'RADARR_URL', label: 'Radarr URL', group: 'Radarr', secret: false },
  { key: 'RADARR_KEY', label: 'Radarr API Key', group: 'Radarr', secret: true },
  { key: 'SONARR_URL', label: 'Sonarr URL', group: 'Sonarr', secret: false },
  { key: 'SONARR_KEY', label: 'Sonarr API Key', group: 'Sonarr', secret: true },
  { key: 'SABNZBD_URL', label: 'SABnzbd URL', group: 'SABnzbd', secret: false },
  { key: 'SABNZBD_API_KEY', label: 'SABnzbd API Key', group: 'SABnzbd', secret: true },
  { key: 'PLEX_URL', label: 'Plex URL', group: 'Plex', secret: false },
  { key: 'PLEX_TOKEN', label: 'Plex Token', group: 'Plex', secret: true },
  { key: 'PUSHOVER_USER_KEY', label: 'Pushover User Key', group: 'Pushover', secret: true },
  { key: 'PUSHOVER_API_TOKEN', label: 'Pushover API Token', group: 'Pushover', secret: true },
  { key: 'ENABLE_IMPORT_NOTIFICATIONS', label: 'Enable Import Notifications (true/false — Pi only)', group: 'App Behavior', secret: false },
  { key: 'CLEANUP_WATCHED_PERCENT', label: 'Cleanup Watched Threshold (%)', group: 'App Behavior', secret: false },
  { key: 'CLEANUP_EXCLUDED_SHOWS', label: 'Cleanup Excluded Shows (comma-separated)', group: 'App Behavior', secret: false },
];

async function readEnvLines(): Promise<string[]> {
  try {
    const raw = await readFile(ENV_FILE, 'utf8');
    return raw.split('\n');
  } catch {
    return [];
  }
}

function parseEnvValue(lines: string[], key: string): string | null {
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    if (trimmed.slice(0, eq) === key) return trimmed.slice(eq + 1);
  }
  return null;
}

export interface SettingStatus {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  isSet: boolean;
  value: string | null; // only populated for non-secret fields
}

export async function getSettingsStatus(): Promise<SettingStatus[]> {
  const lines = await readEnvLines();
  return SETTINGS_SCHEMA.map((field) => {
    const raw = parseEnvValue(lines, field.key);
    return {
      key: field.key,
      label: field.label,
      group: field.group,
      secret: field.secret,
      isSet: raw !== null && raw !== '',
      value: field.secret ? null : raw,
    };
  });
}

/** Copies the current .env.local into data/env-backups/ before any write, pruning old backups beyond MAX_BACKUPS. */
async function backupEnvFile(): Promise<void> {
  let current: string;
  try {
    current = await readFile(ENV_FILE, 'utf8');
  } catch {
    return; // nothing to back up yet
  }
  await mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  await writeFile(path.join(BACKUP_DIR, `.env.local.${stamp}.bak`), current, 'utf8');

  const files = (await readdir(BACKUP_DIR)).filter((f) => f.endsWith('.bak')).sort();
  const toDelete = files.slice(0, Math.max(0, files.length - MAX_BACKUPS));
  await Promise.all(toDelete.map((f) => unlink(path.join(BACKUP_DIR, f))));
}

export async function updateSettings(updates: Record<string, string>): Promise<void> {
  const validKeys = new Set(SETTINGS_SCHEMA.map((f) => f.key));
  const entries = Object.entries(updates).filter(([k]) => validKeys.has(k) && k.length > 0);
  if (entries.length === 0) return;

  await backupEnvFile();

  const lines = await readEnvLines();
  const updatedKeys = new Set<string>();

  const newLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed) return line;
    const eq = trimmed.indexOf('=');
    if (eq === -1) return line;
    const k = trimmed.slice(0, eq);
    const match = entries.find(([uk]) => uk === k);
    if (match) {
      updatedKeys.add(k);
      return `${k}=${match[1]}`;
    }
    return line;
  });

  for (const [k, v] of entries) {
    if (!updatedKeys.has(k)) newLines.push(`${k}=${v}`);
  }

  await writeFile(ENV_FILE, newLines.join('\n'), 'utf8');
}
