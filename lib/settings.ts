import { mkdir, readFile, writeFile, readdir, unlink } from 'fs/promises';
import path from 'path';
import { GENRE_CATALOG, DEFAULT_GENRE_IDS, type GenreDef } from '@/lib/genreCatalog';
import { MENU_LINK_CATALOG, DEFAULT_LINK_IDS, type MenuLinkDef } from '@/lib/menuLinks';

const ENV_FILE = path.join(process.cwd(), '.env.local');
const BACKUP_DIR = path.join(process.cwd(), 'data', 'env-backups');
const MAX_BACKUPS = 10;

export interface SettingField {
  key: string;
  label: string;
  group: string;
  secret: boolean; // if true, never echo the actual value back to the client
  type?: 'boolean' | 'profile' | 'showlist'; // 'boolean' renders a toggle; 'profile' renders a quality-profile dropdown populated by testing the service; 'showlist' renders removable show chips with Sonarr-library suggestions
  /** For boolean fields only - what an unset env var actually evaluates to at runtime (must match the corresponding lib/*.ts check exactly), so the Enable/Disable dropdown reflects real behavior instead of always defaulting to "Disable" when nothing's been explicitly saved yet. */
  defaultValue?: 'true' | 'false';
  /** Per-field explainer, rendered as a "?" tooltip on the field's row. Keeps labels short - the what goes in the label, the why/how here. */
  info?: string;
}

export const SETTINGS_SCHEMA: SettingField[] = [
  { key: 'APP_TITLE', label: 'Application Title', group: 'Application', secret: false, info: 'Renames the browser tab and labels the "Open …" link on notifications. Leave blank for Weavarr.' },
  { key: 'APP_URL', label: 'Application URL', group: 'Application', secret: false, info: 'The address notifications link back to. Set it to how you reach the app in a browser, like http://10.0.0.254:6767, or your domain if behind a proxy. Leave it blank and notifications simply carry no link.' },
  { key: 'ENABLE_CSRF_PROTECTION', label: 'CSRF Protection', group: 'Network', secret: false, type: 'boolean', defaultValue: 'true', info: 'A shady website you happen to visit can secretly make your browser send commands to this app, like deleting something or changing a setting. Without this protection the app would obey them. With it on, the app ignores any command that comes from another website. Using the app normally is never affected. Leave it on. The only reason to turn it off: a misconfigured reverse proxy can make the app mistake its own pages for a foreign website and block every save. Turning this off gets you working again while you fix the proxy (or just enable Trust Reverse Proxy Headers below). Takes effect after a restart.' },
  { key: 'TRUST_PROXY', label: 'Trust Reverse Proxy Headers', group: 'Network', secret: false, type: 'boolean', defaultValue: 'false', info: 'Only matters if you put a reverse proxy (nginx, Caddy, Traefik) in front of this app. A proxy hides who is really connecting and passes that info along in headers, but anyone can fake those headers. The app ignores them unless you flip this on to say "I set up that proxy, believe what it says." No proxy? Leave it off. Takes effect after a restart.' },
  { key: 'TMDB_TOKEN', label: 'TMDB Read Access Token', group: 'TMDB', secret: true },
  { key: 'ENABLE_OMDB', label: 'Enable OMDb', group: 'OMDb', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'OMDB_API_KEY', label: 'OMDb API Key', group: 'OMDb', secret: true },
  { key: 'ENABLE_TRAKT', label: 'Enable Trakt', group: 'Trakt', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'TRAKT_CLIENT_ID', label: 'Trakt Client ID (server)', group: 'Trakt', secret: true },
  { key: 'NEXT_PUBLIC_TRAKT_CLIENT_ID', label: 'Trakt Client ID (public)', group: 'Trakt', secret: false },
  { key: 'ENABLE_RADARR', label: 'Enable Radarr', group: 'Radarr', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'RADARR_URL', label: 'Radarr URL', group: 'Radarr', secret: false },
  { key: 'RADARR_KEY', label: 'Radarr API Key', group: 'Radarr', secret: true },
  { key: 'RADARR_DEFAULT_PROFILE', label: 'Default Quality Profile', group: 'Radarr', secret: false, type: 'profile' },
  { key: 'RADARR_HIGHEST_PROFILE', label: 'Highest Quality Profile', group: 'Radarr', secret: false, type: 'profile' },
  { key: 'ENABLE_SONARR', label: 'Enable Sonarr', group: 'Sonarr', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'SONARR_URL', label: 'Sonarr URL', group: 'Sonarr', secret: false },
  { key: 'SONARR_KEY', label: 'Sonarr API Key', group: 'Sonarr', secret: true },
  { key: 'SONARR_DEFAULT_PROFILE', label: 'Default Quality Profile', group: 'Sonarr', secret: false, type: 'profile' },
  { key: 'SONARR_HIGHEST_PROFILE', label: 'Highest Quality Profile', group: 'Sonarr', secret: false, type: 'profile' },
  { key: 'ENABLE_SABNZBD', label: 'Enable SABnzbd', group: 'SABnzbd', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'SABNZBD_URL', label: 'SABnzbd URL', group: 'SABnzbd', secret: false },
  { key: 'SABNZBD_API_KEY', label: 'SABnzbd API Key', group: 'SABnzbd', secret: true },
  { key: 'ENABLE_NZBGET', label: 'Enable NZBGet', group: 'NZBGet', secret: false, type: 'boolean', defaultValue: 'false' },
  { key: 'NZBGET_URL', label: 'NZBGet URL', group: 'NZBGet', secret: false },
  { key: 'NZBGET_USERNAME', label: 'NZBGet Username', group: 'NZBGet', secret: false },
  { key: 'NZBGET_PASSWORD', label: 'NZBGet Password', group: 'NZBGet', secret: true },
  { key: 'ENABLE_PLEX', label: 'Enable Plex', group: 'Plex', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'PLEX_URL', label: 'Plex URL', group: 'Plex', secret: false },
  { key: 'PLEX_TOKEN', label: 'Plex Token', group: 'Plex', secret: true },
  { key: 'ENABLE_PLEX_WATCHLIST_SYNC', label: 'Auto-add Plex Watchlist Items', group: 'Plex', secret: false, type: 'boolean', defaultValue: 'false' },
  { key: 'ENABLE_JELLYFIN', label: 'Enable Jellyfin', group: 'Jellyfin', secret: false, type: 'boolean', defaultValue: 'false' },
  { key: 'JELLYFIN_URL', label: 'Jellyfin URL', group: 'Jellyfin', secret: false },
  { key: 'JELLYFIN_API_KEY', label: 'Jellyfin API Key', group: 'Jellyfin', secret: true },
  { key: 'JELLYFIN_USER_ID', label: 'Jellyfin Username', group: 'Jellyfin', secret: false },
  { key: 'ENABLE_WATCHED_SYNC', label: 'Sync Watched Between Media Players', group: 'Watched Sync', secret: false, type: 'boolean', defaultValue: 'false' },
  { key: 'ENABLE_PUSHOVER', label: 'Enable Pushover', group: 'Pushover', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'PUSHOVER_USER_KEY', label: 'Pushover User Key', group: 'Pushover', secret: true },
  { key: 'PUSHOVER_API_TOKEN', label: 'Pushover API Token', group: 'Pushover', secret: true },
  { key: 'PUSHOVER_NOTIFY_IMPORTS', label: 'Send "Ready to Watch" Pings', group: 'Pushover', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'PUSHOVER_NOTIFY_ALERTS', label: 'Send Error Alerts', group: 'Pushover', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'ENABLE_WEBHOOK_NOTIFY', label: 'Enable Webhook Notifications', group: 'Webhook', secret: false, type: 'boolean', defaultValue: 'false' },
  { key: 'WEBHOOK_NOTIFY_URL', label: 'Webhook URL', group: 'Webhook', secret: true },
  { key: 'WEBHOOK_NOTIFY_IMPORTS', label: 'Send "Ready to Watch" Pings', group: 'Webhook', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'WEBHOOK_NOTIFY_ALERTS', label: 'Send Error Alerts', group: 'Webhook', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'ENABLE_DISCORD_NOTIFY', label: 'Enable Discord Notifications', group: 'Discord', secret: false, type: 'boolean', defaultValue: 'false' },
  { key: 'DISCORD_WEBHOOK_URL', label: 'Discord Webhook URL', group: 'Discord', secret: true },
  { key: 'DISCORD_NOTIFY_IMPORTS', label: 'Send "Ready to Watch" Pings', group: 'Discord', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'DISCORD_NOTIFY_ALERTS', label: 'Send Error Alerts', group: 'Discord', secret: false, type: 'boolean', defaultValue: 'true' },
  { key: 'ENABLE_IMPORT_NOTIFICATIONS', label: 'Import Notifications', group: 'App Behavior', secret: false, type: 'boolean', defaultValue: 'false', info: 'Watches the media server for requested titles actually landing in the library and sends a "ready to watch" ping through your notification channels (checked every 2 minutes).' },
  { key: 'ENABLE_CONNECTION_ALERTS', label: 'Connection Drop Alerts', group: 'App Behavior', secret: false, type: 'boolean', defaultValue: 'false', info: 'Sends an alert when a connected service (Radarr, Sonarr, Plex…) stops responding to the 10-minute health check.' },
  { key: 'CLEANUP_WATCHED_PERCENT', label: 'Cleanup Watched Threshold (%)', group: 'App Behavior', secret: false, info: 'An in-progress episode or movie counts as watched for the cleanup lifecycle once you\'ve seen at least this much of it. Default 90.' },
  { key: 'CLEANUP_EXCLUDED_SHOWS', label: 'Cleanup Excluded Shows', group: 'App Behavior', secret: false, type: 'showlist', info: 'Shows that cleanup must never suggest deleting. The comfort rewatches live here. Pick from your Sonarr library or type any title, and remove one with its ×.' },
  { key: 'MENU_GENRES', label: 'Genre tabs, in order (comma-separated ids)', group: 'Menu', secret: false },
  { key: 'MENU_LINKS', label: 'Other menu items, in order (comma-separated ids)', group: 'Menu', secret: false },
  { key: 'ENABLE_SCHEDULED_BACKUPS', label: 'Enable Scheduled Backups', group: 'Backup', secret: false, type: 'boolean' },
  { key: 'BACKUP_RETENTION_COUNT', label: 'Backups to Keep', group: 'Backup', secret: false },
];

export interface MenuConfig {
  genres: GenreDef[];
  links: MenuLinkDef[];
}

/** null (key never saved) means "not configured yet" -> use defaults. An explicit empty string means the user deliberately chose zero items. */
function parseOrderedIds(lines: string[], key: string, defaults: string[]): string[] {
  const raw = parseEnvValue(lines, key);
  if (raw === null) return defaults;
  return raw.trim() === '' ? [] : raw.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Reads menu config straight off disk (not cached process.env), so changes apply without a restart. */
export async function getMenuConfig(): Promise<MenuConfig> {
  const lines = await readEnvLines();
  const genreIds = parseOrderedIds(lines, 'MENU_GENRES', DEFAULT_GENRE_IDS);
  const linkIds = parseOrderedIds(lines, 'MENU_LINKS', DEFAULT_LINK_IDS);
  const genres = genreIds
    .map((id) => GENRE_CATALOG.find((g) => g.id === id))
    .filter((g): g is GenreDef => Boolean(g));
  const links = linkIds
    .map((id) => MENU_LINK_CATALOG.find((l) => l.id === id))
    .filter((l): l is MenuLinkDef => Boolean(l));
  return { genres, links };
}

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
  type?: 'boolean' | 'profile' | 'showlist';
  defaultValue?: 'true' | 'false';
  info?: string;
}

/** Server-internal only - the real value, including secrets. Never return this from an API route directly. */
export async function getRawEnvValue(key: string): Promise<string | null> {
  const lines = await readEnvLines();
  return parseEnvValue(lines, key);
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
      type: field.type,
      defaultValue: field.defaultValue,
      info: field.info,
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

// Serializes every .env.local update. Three different panels POST saves to the
// same endpoint; without this, two near-simultaneous saves both read the file,
// then the later write rewrites it from a stale snapshot and silently discards
// the earlier save's keys while both report success.
let envWriteChain: Promise<void> = Promise.resolve();

export function updateSettings(updates: Record<string, string>): Promise<void> {
  const run = envWriteChain.then(() => applyUpdates(updates));
  // Keep the chain alive even when a write fails, so one error doesn't wedge
  // every subsequent save.
  envWriteChain = run.catch(() => {});
  return run;
}

async function applyUpdates(updates: Record<string, string>): Promise<void> {
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

  // Direct write, deliberately NOT write-then-rename: in Docker, .env.local
  // is a single-file bind mount - the mounted file itself is writable, but
  // creating a sibling tmp file in /app is EACCES (root-owned dir) and
  // renaming over a bind-mounted file fails regardless (the mount pins the
  // inode). A tmp+rename version shipped briefly and broke every settings
  // save in production. Torn-write risk on power loss is covered by the
  // automatic pre-write backups above; the write queue covers concurrency.
  await writeFile(ENV_FILE, newLines.join('\n'), 'utf8');
}
