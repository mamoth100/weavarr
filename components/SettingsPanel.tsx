'use client';

import { useEffect, useRef, useState } from 'react';
import { useRestartApp } from '@/hooks/useRestartApp';
import { useDismissable } from '@/hooks/useDismissable';
import Modal from '@/components/Modal';
import Toggle from '@/components/Toggle';
import PlexSignIn from '@/components/PlexSignIn';
import WebpushDeviceButton from '@/components/WebpushDeviceButton';

interface SettingStatus {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  isSet: boolean;
  value: string | null;
  type?: 'boolean' | 'profile' | 'showlist';
  defaultValue?: 'true' | 'false';
  info?: string;
}

interface QualityProfileOption {
  id: number;
  name: string;
}

// Webpush is deliberately absent: its Test lives inside WebpushDeviceButton
// and only renders once this device is actually subscribed - a Test button
// next to a feature that can't work yet just produces confusing errors.
const TESTABLE_GROUPS = new Set(['Radarr', 'Sonarr', 'SABnzbd', 'NZBGet', 'Plex', 'Jellyfin', 'TMDB', 'OMDb', 'Trakt', 'Pushover', 'Webhook', 'Discord']);

// What a group is for, shown as a "?" tooltip in the group header. The link
// points at where to get a key/token, for groups that need one from an
// external site.
const GROUP_INFO: Record<string, { text: string; linkLabel?: string; linkHref?: string }> = {
  TMDB: {
    text: 'TMDB supplies the movie/show metadata this app is built on - posters, descriptions, ratings. Works out of the box with a bundled key. Setting your own isn\'t about rate limits (TMDB limits per-IP, not per-key) - it just means you\'re not affected if the shared bundled key ever gets abused and revoked.',
    linkLabel: 'Get a TMDB key',
    linkHref: 'https://www.themoviedb.org/settings/api',
  },
  OMDb: {
    text: 'Optional. Adds IMDb rating, Rotten Tomatoes, Metacritic, and content rating into the composite score. Free tier available (1,000 requests/day) - leave blank and the app falls back to a TMDB-only score.',
    linkLabel: 'Get an OMDb key',
    linkHref: 'https://www.omdbapi.com/apikey.aspx',
  },
  Trakt: {
    text: 'Optional. Adds Trakt\'s community rating into the composite score. Leave blank and the app falls back to a TMDB/IMDb-only score.',
    linkLabel: 'Create a Trakt app',
    linkHref: 'https://trakt.tv/oauth/applications',
  },
};

/** Toggle-plus-number settings pairs rendered as one row: the toggle's row hosts the number input, one "?" covers both, and the number field never gets its own row. */
const INLINE_NUMBER_PAIRS: Record<string, { countKey: string; unit: string; placeholder: string; min: number; aria: string }> = {
  ENABLE_EPISODE_WARN: { countKey: 'EPISODE_WARN_COUNT', unit: 'episodes', placeholder: '30', min: 1, aria: 'Big Add Warning Threshold (episodes)' },
  ENABLE_AUTO_CLEANUP: { countKey: 'AUTO_CLEANUP_DAYS', unit: 'days after watch', placeholder: '3', min: 0, aria: 'Auto-Delete Grace Period (days)' },
};
const INLINE_NUMBER_KEYS = new Set(Object.values(INLINE_NUMBER_PAIRS).map((p) => p.countKey));

/** The one "?" tooltip - group headers and individual field rows both use it. Click to open, outside-click/Escape to close. */
function InfoTooltip({ ariaLabel, text, linkLabel, linkHref }: { ariaLabel: string; text: string; linkLabel?: string; linkHref?: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useDismissable(open, containerRef, () => setOpen(false));

  return (
    <div className="relative ml-auto flex-shrink-0" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
          open ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
        }`}
        aria-label={ariaLabel}
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg p-3 text-xs text-zinc-300">
          <p className={linkHref ? 'mb-2' : ''}>{text}</p>
          {linkHref && (
            <a
              href={linkHref}
              target="_blank"
              rel="noopener noreferrer"
              className="text-amber-400 hover:text-amber-300 font-medium"
            >
              {linkLabel} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/** On-demand media-server sync: starts Plex/Jellyfin library rescans and runs the watched sync. Lives in the Watched Sync group header. */
function SyncNowButton() {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setStatus('busy');
    setMessage(null);
    try {
      const res = await fetch('/api/watched-sync/run', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Sync failed');
      const parts = [];
      if (data.refreshed) parts.push('library rescans started');
      if (typeof data.marks === 'number') parts.push(`${data.marks} watched mark${data.marks === 1 ? '' : 's'} synced`);
      setMessage(parts.join(' · ') || 'Done');
      setStatus('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={run}
        disabled={status === 'busy'}
        className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
      >
        {status === 'busy' ? 'Syncing…' : 'Sync now'}
      </button>
      {message && <span className={`text-xs font-medium ${status === 'error' ? 'text-red-400' : 'text-green-400'}`}>{message}</span>}
    </span>
  );
}

/** Per-player library rescan - makes Plex or Jellyfin re-read what's on disk right now. */
function formatTimeLeft(deleteAt: string): string {
  const ms = new Date(deleteAt).getTime() - Date.now();
  if (ms <= 0) return 'Out of time';
  const mins = Math.ceil(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `in ${hours}h ${mins % 60}m`;
  return `in ${Math.floor(hours / 24)}d ${hours % 24}h`;
}

interface ChoppingBlockData {
  enabled: boolean;
  days: number;
  items: { label: string; reason: string; deleteAt: string }[];
}

interface DismissedItem {
  key: string;
  type: 'movie' | 'tv';
  title: string;
  year?: number;
  seasonNumber?: number;
  episodeNumber?: number;
}

function dismissedItemLabel(it: DismissedItem): string {
  if (it.type === 'movie') return `${it.title}${it.year ? ` (${it.year})` : ''}`;
  return `${it.title} S${String(it.seasonNumber).padStart(2, '0')}E${String(it.episodeNumber).padStart(2, '0')}`;
}

/** Undoes a Clear from Recently Watched - the item goes back to being a normal auto-cleanup candidate. */
function UndismissButton({ itemKey, onDone }: { itemKey: string; onDone: () => void }) {
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function handleClick() {
    setStatus('loading');
    try {
      const res = await fetch('/api/recently-watched/undismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: itemKey }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed');
      onDone();
    } catch {
      setStatus('error');
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={status === 'loading'}
      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors disabled:opacity-60 whitespace-nowrap ${
        status === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
      }`}
    >
      {status === 'loading' ? 'Restoring…' : status === 'error' ? 'Failed - retry' : 'Restore'}
    </button>
  );
}

/** Read-only preview of what auto-delete would remove and when - lets people gauge the feature before (and after) trusting it. */
function ChoppingBlockButton() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ChoppingBlockData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dismissedItems, setDismissedItems] = useState<DismissedItem[] | null>(null);

  function show() {
    setOpen(true);
    setData(null);
    setError(null);
    setDismissedItems(null);
    fetch('/api/auto-cleanup/preview', { cache: 'no-store' })
      .then((res) => res.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    fetch('/api/recently-watched/dismissed', { cache: 'no-store' })
      .then((res) => res.json())
      .then((d) => setDismissedItems(d.items ?? []))
      .catch(() => setDismissedItems([]));
  }

  return (
    <>
      <button
        onClick={show}
        className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 whitespace-nowrap"
      >
        Chopping block
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="On the chopping block"
        footer={
          <button
            onClick={() => setOpen(false)}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Close
          </button>
        }
      >
        {error ? (
          <p className="text-sm text-red-400">{error}</p>
        ) : !data ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-8 bg-zinc-800 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {!data.enabled && (
              <p className="text-xs text-amber-400">
                Auto-delete is currently off. This is what would go if you turned it on.
              </p>
            )}
            {data.items.length === 0 ? (
              <p className="text-sm text-zinc-400">Nothing qualifies right now.</p>
            ) : (
              <div className="rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800 max-h-72 overflow-y-auto">
                {data.items.map((it) => (
                  <div key={it.label} className="px-3 py-2 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm truncate">{it.label}</p>
                      <p className="text-xs text-zinc-500">{it.reason}</p>
                    </div>
                    <span
                      className={`text-xs font-medium whitespace-nowrap ${
                        formatTimeLeft(it.deleteAt) === 'Out of time' ? 'text-red-400' : 'text-amber-400'
                      }`}
                    >
                      {formatTimeLeft(it.deleteAt)}
                    </span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-zinc-500">
              Checked hourly. Grace period: {data.days} {data.days === 1 ? 'day' : 'days'} after the watch.
            </p>
            {dismissedItems && dismissedItems.length > 0 && (
              <div className="pt-3 border-t border-zinc-800 space-y-2">
                <p className="text-xs text-zinc-500 uppercase tracking-wider">Protected (cleared from Recently Watched)</p>
                <div className="rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800 max-h-52 overflow-y-auto">
                  {dismissedItems.map((it) => (
                    <div key={it.key} className="px-3 py-2 flex items-center justify-between gap-3">
                      <p className="text-sm truncate">{dismissedItemLabel(it)}</p>
                      <UndismissButton
                        itemKey={it.key}
                        onDone={() => setDismissedItems((prev) => prev?.filter((d) => d.key !== it.key) ?? null)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </>
  );
}

/** Restart a service through its own API. Two-click confirm - a restart interrupts whatever the service is doing, so a stray tap shouldn't fire it. */
function RestartServiceButton({ service }: { service: 'sonarr' | 'radarr' | 'sabnzbd' | 'nzbget' }) {
  const [status, setStatus] = useState<'idle' | 'confirm' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setStatus('busy');
    setMessage(null);
    try {
      const res = await fetch('/api/service-restart', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ service }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Restart failed');
      setMessage('Restart sent - it should be back within a minute');
      setStatus('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={() => (status === 'confirm' ? run() : setStatus('confirm'))}
        disabled={status === 'busy'}
        className={`px-2.5 py-1 rounded-md text-xs font-medium disabled:opacity-60 ${
          status === 'confirm' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
        }`}
      >
        {status === 'busy' ? 'Restarting…' : status === 'confirm' ? 'Really restart?' : 'Restart'}
      </button>
      {status === 'done' && <span className="text-xs font-medium text-green-400">{message}</span>}
      {status === 'error' && <span className="text-xs font-medium text-red-400">{message}</span>}
    </span>
  );
}

function RescanButton({ server }: { server: 'plex' | 'jellyfin' }) {
  const [status, setStatus] = useState<'idle' | 'busy' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setStatus('busy');
    setMessage(null);
    try {
      const res = await fetch('/api/media-refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ server }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Rescan failed');
      setMessage('Scan started - the server finishes it on its own time');
      setStatus('done');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
      setStatus('error');
    }
  }

  return (
    <span className="flex items-center gap-2">
      <button
        onClick={run}
        disabled={status === 'busy'}
        className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
      >
        {status === 'busy' ? 'Starting…' : 'Rescan library'}
      </button>
      {message && <span className={`text-xs font-medium ${status === 'error' ? 'text-red-400' : 'text-green-400'}`}>{message}</span>}
    </span>
  );
}

function GroupInfoTooltip({ group }: { group: string }) {
  const info = GROUP_INFO[group];
  if (!info) return null;
  return <InfoTooltip ariaLabel={`About ${group}`} text={info.text} linkLabel={info.linkLabel} linkHref={info.linkHref} />;
}

/**
 * Chip editor for a comma-separated show list (Seerr-filter style): each
 * show is a chip with an ×, new ones come from a Sonarr-library-suggested
 * input. Free text stays allowed on purpose. Cleanup matches titles from
 * the media server's watch history, and a show can live there without being
 * registered in Sonarr.
 */
function ShowListEditor({ value, onChange, disabled }: { value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const [sonarrTitles, setSonarrTitles] = useState<string[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    fetch('/api/sonarr/series', { cache: 'no-store' })
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.series)) {
          setSonarrTitles((d.series as { title: string }[]).map((s) => s.title).sort((a, b) => a.localeCompare(b)));
        }
      })
      .catch(() => {}); // no Sonarr = no suggestions, typing still works
  }, []);

  const items = value.split(',').map((s) => s.trim()).filter(Boolean);

  function add(title: string) {
    const t = title.trim();
    setDraft('');
    if (!t || items.some((i) => i.toLowerCase() === t.toLowerCase())) return;
    onChange([...items, t].join(','));
  }

  const suggestions = sonarrTitles.filter((t) => !items.some((i) => i.toLowerCase() === t.toLowerCase()));

  return (
    <div className="flex-1 space-y-2">
      {items.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {items.map((t) => (
            <span key={t} className="inline-flex items-center gap-1 bg-zinc-800 ring-1 ring-zinc-700 text-zinc-200 text-xs rounded-full pl-2.5 pr-1 py-1 touch:py-1.5">
              {t}
              <button
                type="button"
                onClick={() => onChange(items.filter((i) => i !== t).join(','))}
                disabled={disabled}
                aria-label={`Remove ${t}`}
                className="w-4 h-4 touch:w-6 touch:h-6 rounded-full flex items-center justify-center text-zinc-400 hover:text-white hover:bg-zinc-600"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          list="showlist-suggestions"
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add(draft);
            }
          }}
          placeholder={sonarrTitles.length ? 'Add a show from Sonarr, or type any title…' : 'Type a show title…'}
          className="flex-1 min-w-0 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 touch:py-2 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-500 disabled:opacity-50"
        />
        <datalist id="showlist-suggestions">
          {suggestions.map((t) => (
            <option key={t} value={t} />
          ))}
        </datalist>
        <button
          type="button"
          onClick={() => add(draft)}
          disabled={disabled || !draft.trim()}
          className="px-3 py-1.5 touch:px-4 touch:py-2 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </div>
  );
}

// Groups whose quality-profile dropdowns should auto-populate on load if
// already configured, rather than staying greyed out until a manual Test.
// Auto-tested on load when configured, so the status dots and profile
// dropdowns are live without clicking Test. Never the notification groups:
// their Test sends a real message.
const AUTO_TEST_GROUPS = ['Radarr', 'Sonarr', 'SABnzbd', 'NZBGet', 'Plex', 'Jellyfin', 'TMDB', 'OMDb'];

// What "configured" means per service - the fields that have to be set for
// it to work at all. Drives the status dots and the setup card.
const GROUP_REQUIRED_KEYS: Record<string, string[]> = {
  TMDB: ['TMDB_TOKEN'],
  OMDb: ['OMDB_API_KEY'],
  Trakt: ['TRAKT_CLIENT_ID'],
  Radarr: ['RADARR_URL', 'RADARR_KEY'],
  Sonarr: ['SONARR_URL', 'SONARR_KEY'],
  SABnzbd: ['SABNZBD_URL', 'SABNZBD_API_KEY'],
  NZBGet: ['NZBGET_URL', 'NZBGET_USERNAME', 'NZBGET_PASSWORD'],
  Plex: ['PLEX_URL', 'PLEX_TOKEN'],
  Jellyfin: ['JELLYFIN_URL', 'JELLYFIN_API_KEY'],
  Pushover: ['PUSHOVER_USER_KEY', 'PUSHOVER_API_TOKEN'],
  Webhook: ['WEBHOOK_NOTIFY_URL'],
  Discord: ['DISCORD_WEBHOOK_URL'],
};
const GROUP_ENABLE_KEY: Record<string, string> = {
  OMDb: 'ENABLE_OMDB',
  Trakt: 'ENABLE_TRAKT',
  Radarr: 'ENABLE_RADARR',
  Sonarr: 'ENABLE_SONARR',
  SABnzbd: 'ENABLE_SABNZBD',
  NZBGet: 'ENABLE_NZBGET',
  Plex: 'ENABLE_PLEX',
  Jellyfin: 'ENABLE_JELLYFIN',
  Pushover: 'ENABLE_PUSHOVER',
  Webhook: 'ENABLE_WEBHOOK_NOTIFY',
  Discord: 'ENABLE_DISCORD_NOTIFY',
};

type ConfigState = 'off' | 'unset' | 'set';

function groupConfigState(settings: SettingStatus[], group: string): ConfigState {
  const enableKey = GROUP_ENABLE_KEY[group];
  if (enableKey) {
    const f = settings.find((s) => s.key === enableKey);
    if ((f?.value ?? f?.defaultValue ?? 'false') !== 'true') return 'off';
  }
  const required = GROUP_REQUIRED_KEYS[group] ?? [];
  return required.every((k) => settings.find((s) => s.key === k)?.isSet) ? 'set' : 'unset';
}

/** One dot per service on a section header, so the state is visible without expanding anything. */
function StatusDot({ label, state, testStatus }: { label: string; state: ConfigState; testStatus?: TestState['status'] }) {
  const detail =
    state === 'off' ? 'disabled' :
    state === 'unset' ? 'not configured' :
    testStatus === 'ok' ? 'connected' :
    testStatus === 'fail' ? 'last test failed' :
    testStatus === 'testing' ? 'testing' :
    'configured';
  const color =
    state === 'off' ? 'bg-zinc-700' :
    state === 'unset' ? 'bg-transparent ring-1 ring-zinc-500' :
    testStatus === 'ok' ? 'bg-green-400' :
    testStatus === 'fail' ? 'bg-red-400' :
    testStatus === 'testing' ? 'bg-zinc-300 animate-pulse' :
    'bg-zinc-300';
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] normal-case tracking-normal font-medium text-zinc-500" title={`${label}: ${detail}`}>
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} aria-hidden />
      <span className={state === 'off' ? 'line-through' : ''}>{label}</span>
      <span className="sr-only">{detail}</span>
    </span>
  );
}

// The first-ten-minutes checklist. Discover works with nothing configured
// (TMDB access is bundled); these are the three things that unlock the rest.
const SETUP_STEPS = [
  { id: 'arr', label: 'Connect Sonarr or Radarr', why: 'Lets you request shows and movies.', groups: ['Sonarr', 'Radarr'], section: 'Media Management', required: true },
  { id: 'player', label: 'Connect Plex or Jellyfin', why: 'Powers the Watch page, watched history and cleanup.', groups: ['Plex', 'Jellyfin'], section: 'Media Players', required: true },
  { id: 'downloader', label: 'Connect SABnzbd or NZBGet', why: 'Optional. Shows download progress and the queue.', groups: ['SABnzbd', 'NZBGet'], section: 'Downloaders', required: false },
];

function sectionDomId(section: string): string {
  return `settings-section-${section.toLowerCase().replace(/\s+/g, '-')}`;
}

// Groups each service's Settings fields into a broader category so the page
// reads as ~7 sections instead of 12 flat, equally-weighted blocks.
const SECTION_ORDER = ['App Config', 'Metadata', 'Media Management', 'Downloaders', 'Media Players', 'Notifications', 'Misc'];
const GROUP_TO_SECTION: Record<string, string> = {
  TMDB: 'Metadata',
  OMDb: 'Metadata',
  Trakt: 'Metadata',
  Radarr: 'Media Management',
  Sonarr: 'Media Management',
  SABnzbd: 'Downloaders',
  NZBGet: 'Downloaders',
  Plex: 'Media Players',
  Jellyfin: 'Media Players',
  'Watched Sync': 'Media Players',
  Pushover: 'Notifications',
  Webhook: 'Notifications',
  Discord: 'Notifications',
  Webpush: 'Notifications',
  // All app-level knobs in one section: identity/links, network posture,
  // and behavior toggles. 'Misc' stays in SECTION_ORDER only as the
  // fallback bucket for any group without a mapping.
  Application: 'App Config',
  Network: 'App Config',
  'App Behavior': 'App Config',
  'Auto-Delete': 'App Config',
};

// Backup gets its own top-level tab in SettingsLayout.tsx (BackupPanel.tsx),
// not a section here - it isn't a "connection" and the user was explicit
// it shouldn't read as one.
const EXCLUDED_GROUPS = new Set(['Backup']);

// What the Connections tab shows - everything except the sections that have
// their own top-level tabs (App Config, Notifications). Misc stays here as
// the fallback bucket for unmapped groups.
export const CONNECTION_SECTIONS = ['Metadata', 'Media Management', 'Downloaders', 'Media Players', 'Misc'];

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string; profiles?: QualityProfileOption[] };

/** One shared panel behind the Connections / App Config / Notifications tabs - `sections` picks which SECTION_ORDER entries this instance renders. A single-section instance drops the collapsible section header (the tab name already says it) and shows its groups directly. */
export default function SettingsPanel({ sections }: { sections?: string[] } = {}) {
  const renderSections = sections ?? SECTION_ORDER;
  const singleSection = renderSections.length === 1;
  const [settings, setSettings] = useState<SettingStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  // Secret fields never round-trip their real value, so "leave blank" has
  // always meant "unchanged" - there was never a way to explicitly wipe one
  // via this UI. Tracked separately from edits so a blank field still means
  // "unchanged" by default; only fields the user actively marks here get an
  // explicit empty value sent on save.
  const [clearedKeys, setClearedKeys] = useState<Set<string>>(new Set());
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  // Set on a successful save, cleared when the app comes back from a
  // restart. Every key on these tabs is read at boot, so a save is not live
  // until then - this is what makes that visible.
  const [needsRestart, setNeedsRestart] = useState(false);
  const { restartStatus, restartError, restart: handleRestart, reset: resetRestart } = useRestartApp(() => setNeedsRestart(false));
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(SECTION_ORDER));
  // Services already auto-tested by this instance. Per service, not a single
  // flag: the Connections and App Config tabs share one component instance,
  // so a flag set while App Config was showing (which tests nothing) left
  // the Connections dots grey until a page refresh.
  const autoTestedRef = useRef(new Set<string>());

  function expandSection(section: string, scroll = false) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.delete(section);
      return next;
    });
    if (scroll) {
      // After the expand has rendered.
      setTimeout(() => document.getElementById(sectionDomId(section))?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    }
  }

  function toggleSection(section: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) next.delete(section);
      else next.add(section);
      return next;
    });
  }

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        setSettings(data.settings);
        // A section whose required service is still unconfigured starts
        // open, so a fresh install sees the fields it needs to fill in
        // instead of four collapsed headers.
        for (const step of SETUP_STEPS) {
          if (!step.required) continue;
          const done = step.groups.some((g) => groupConfigState(data.settings, g) === 'set');
          if (!done) expandSection(step.section);
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Quality-profile dropdowns need a live profile list from the service itself -
  // if Radarr/Sonarr are already configured, silently re-run their Test so the
  // dropdowns aren't stuck greyed out every time this page loads.
  const renderKey = renderSections.join(',');
  useEffect(() => {
    if (!settings) return;
    for (const group of AUTO_TEST_GROUPS) {
      if (autoTestedRef.current.has(group)) continue;
      // Only auto-test services this instance actually renders - the App
      // Config / Notifications tabs shouldn't fire Radarr/Sonarr probes.
      if (!renderSections.includes(GROUP_TO_SECTION[group] ?? 'Misc')) continue;
      if (groupConfigState(settings, group) !== 'set') continue;
      autoTestedRef.current.add(group);
      handleTest(group);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings, renderKey]);

  if (error) {
    return <p className="text-red-400 text-sm">Failed to load settings: {error}</p>;
  }

  if (!settings) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-14 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const groups = Array.from(new Set(settings.map((s) => s.group))).filter(
    (g) => g !== 'Menu' && !EXCLUDED_GROUPS.has(g) && renderSections.includes(GROUP_TO_SECTION[g] ?? 'Misc')
  );

  // A NON-secret field emptied in the UI is a real change when it currently
  // holds a saved value - without this, select-all-delete on e.g. PLEX_URL
  // showed a blank input but was silently dropped from the save (and Save
  // stayed disabled at "0 changed"). Secrets keep "blank = unchanged": their
  // inputs are always blank by design, so their explicit path is the Clear
  // button (clearedKeys).
  function isNonSecretClear(key: string, value: string): boolean {
    if (value.trim() !== '') return false;
    const field = settings!.find((s) => s.key === key);
    return !!field && !field.secret && !!(field.value ?? '').trim();
  }

  const changedCount = new Set([
    ...Object.entries(edits).filter(([k, v]) => v.trim() !== '' || isNonSecretClear(k, v)).map(([k]) => k),
    ...Array.from(clearedKeys),
  ]).size;

  function toggleClear(key: string) {
    setClearedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setEdits((prev) => ({ ...prev, [key]: '' }));
  }

  // Reflects unsaved edits too, not just what's persisted - toggling Plex
  // off should grey out Watched Sync immediately, before hitting Save.
  function resolveBoolean(key: string): boolean {
    const field = settings!.find((s) => s.key === key);
    return (edits[key] ?? field?.value ?? field?.defaultValue ?? 'false') === 'true';
  }
  const watchedSyncEligible = resolveBoolean('ENABLE_PLEX') && resolveBoolean('ENABLE_JELLYFIN');

  async function handleTest(group: string) {
    setTestStates((prev) => ({ ...prev, [group]: { status: 'testing' } }));

    const groupFields = settings!.filter((s) => s.group === group);
    const values: Record<string, string> = {};
    for (const f of groupFields) {
      const edited = edits[f.key];
      if (edited && edited.trim() !== '') values[f.key] = edited.trim();
      else if (!f.secret && f.value) values[f.key] = f.value;
    }
    try {
      const res = await fetch('/api/settings/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group, values }),
      });
      const data = await res.json();
      setTestStates((prev) => ({
        ...prev,
        [group]: { status: data.ok ? 'ok' : 'fail', message: data.message, profiles: data.profiles },
      }));
    } catch (err) {
      setTestStates((prev) => ({
        ...prev,
        [group]: { status: 'fail', message: err instanceof Error ? err.message : String(err) },
      }));
    }
  }

  async function handleSave() {
    setSaveStatus('saving');
    setSaveError(null);
    const updates = Object.fromEntries(
      Object.entries(edits).filter(([k, v]) => v.trim() !== '' || isNonSecretClear(k, v))
    );
    for (const key of Array.from(clearedKeys)) updates[key] = '';
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setSaveStatus('saved');
      setNeedsRestart(true);
      resetRestart();
      setEdits({});
      setClearedKeys(new Set());
      // Reload so non-secret fields reflect the saved values
      const refreshed = await fetch('/api/settings', { cache: 'no-store' }).then((r) => r.json());
      if (!refreshed.error) setSettings(refreshed.settings);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  // Setup card: only on the Connections tab, and only while something
  // required is still missing. Once both required rows are done it goes
  // away rather than sitting there as a permanent green checklist.
  const showSetup = renderSections.includes('Media Management');
  const setupRows = SETUP_STEPS.map((step) => ({
    ...step,
    done: step.groups.some((g) => groupConfigState(settings, g) === 'set'),
  }));
  const setupPending = showSetup && setupRows.some((r) => r.required && !r.done);

  return (
    <div className="space-y-6">
      {setupPending && (
        <div className="bg-zinc-900 border border-amber-500/40 rounded-lg p-4 space-y-3">
          <div>
            <h2 className="text-sm font-semibold text-white">Get started</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Browsing already works. Connect these to unlock the rest, then Save and Restart.</p>
          </div>
          <ul className="space-y-2">
            {setupRows.map((row) => (
              <li key={row.id} className="flex items-start gap-3">
                <span
                  className={`mt-0.5 inline-flex items-center justify-center w-5 h-5 rounded-full flex-shrink-0 text-xs ${
                    row.done ? 'bg-green-500 text-zinc-950' : 'ring-1 ring-zinc-600 text-transparent'
                  }`}
                  aria-label={row.done ? 'Done' : 'Not done'}
                >
                  ✓
                </span>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${row.done ? 'text-zinc-400 line-through' : 'text-white'}`}>
                    {row.label}
                    {!row.required && <span className="ml-2 text-[11px] font-normal text-zinc-500 no-underline">optional</span>}
                  </p>
                  <p className="text-xs text-zinc-500">{row.why}</p>
                </div>
                {!row.done && (
                  <button
                    type="button"
                    onClick={() => expandSection(row.section, true)}
                    className="px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-500 text-black hover:bg-amber-400 flex-shrink-0"
                  >
                    Set up
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
        <p>Secret fields (API keys, tokens) never show their current value - leave blank to keep it unchanged.</p>
        {/* The kept count is the real "Backups to Keep" setting, not a hardcoded number - it also governs these pre-save env backups. */}
        <p>
          Every save is backed up first (last{' '}
          {(() => {
            const n = Number(settings.find((s) => s.key === 'BACKUP_RETENTION_COUNT')?.value);
            return Number.isInteger(n) && n > 0 ? n : 10;
          })()}{' '}
          kept), so a bad value can always be rolled back.
        </p>
      </div>

      {renderSections.map((section) => {
        const sectionGroups = groups.filter((g) => (GROUP_TO_SECTION[g] ?? 'Misc') === section);
        if (sectionGroups.length === 0) return null;
        const sectionCollapsed = !singleSection && collapsedSections.has(section);

        const dotGroups = sectionGroups.filter((g) => GROUP_REQUIRED_KEYS[g]);

        return (
          <div key={section} id={sectionDomId(section)} className={singleSection ? '' : 'border border-zinc-800 rounded-lg overflow-hidden scroll-mt-4'}>
            {!singleSection && (
            <button
              onClick={() => toggleSection(section)}
              className="group w-full flex items-center gap-2 px-4 py-3 bg-zinc-900 hover:bg-zinc-800/70 text-left"
            >
              <span className={`inline-block text-zinc-400 transition-transform ${sectionCollapsed ? '-rotate-90' : ''}`}>▾</span>
              {/* Same header treatment as every other Settings tab - each tab
                  used to invent its own (bold white here, text-xs on Backup,
                  nothing on Logs), which made switching tabs feel like
                  switching apps. */}
              <h2 className="text-sm font-semibold text-zinc-400 group-hover:text-white uppercase tracking-wider">{section}</h2>
              {/* Per-service state on the header itself, so nothing has to be
                  expanded to see what is connected, missing, or failing. */}
              {dotGroups.length > 0 && (
                <span className="ml-auto flex items-center gap-3 flex-wrap justify-end">
                  {dotGroups.map((g) => (
                    <StatusDot key={g} label={g} state={groupConfigState(settings, g)} testStatus={testStates[g]?.status} />
                  ))}
                </span>
              )}
            </button>
            )}

            {!sectionCollapsed && (
              <div className={singleSection ? 'space-y-4' : 'p-4 space-y-4'}>
                {sectionGroups.map((group) => {
                  const testState = testStates[group] ?? { status: 'idle' as const };
                  return (
                    <div key={group} className="space-y-2">
                      <div className="flex items-center gap-3">
                        <h3 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{group}</h3>
                        {TESTABLE_GROUPS.has(group) && (
                          <>
                            <button
                              onClick={() => handleTest(group)}
                              disabled={testState.status === 'testing'}
                              className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700 disabled:opacity-60"
                            >
                              {testState.status === 'testing' ? 'Testing…' : 'Test'}
                            </button>
                            {testState.status === 'ok' && (
                              <span className="text-xs font-medium text-green-400">{testState.message}</span>
                            )}
                            {testState.status === 'fail' && (
                              <span className="text-xs font-medium text-red-400">{testState.message}</span>
                            )}
                          </>
                        )}
                        {/* PIN sign-in fills PLEX_TOKEN automatically - finding the token by hand is obscure enough that Seerr-style login is the sane default path. */}
                        {/* Subscriptions are per-device browser state, not a saved setting - the button lives in the group header. */}
                        {group === 'Webpush' && <WebpushDeviceButton />}
                        {group === 'Watched Sync' && <SyncNowButton />}
                        {group === 'Plex' && <RescanButton server="plex" />}
                        {group === 'Jellyfin' && <RescanButton server="jellyfin" />}
                        {group === 'Auto-Delete' && <ChoppingBlockButton />}
                        {group === 'Sonarr' && <RestartServiceButton service="sonarr" />}
                        {group === 'Radarr' && <RestartServiceButton service="radarr" />}
                        {group === 'SABnzbd' && <RestartServiceButton service="sabnzbd" />}
                        {group === 'NZBGet' && <RestartServiceButton service="nzbget" />}
                        {group === 'Plex' && (
                          <PlexSignIn
                            onSaved={() =>
                              fetch('/api/settings', { cache: 'no-store' })
                                .then((r) => r.json())
                                .then((d) => { if (!d.error) setSettings(d.settings); })
                                .catch(() => {})
                            }
                          />
                        )}
                        <GroupInfoTooltip group={group} />
                      </div>
                      <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800">
                        {settings
                          .filter((s) => s.group === group && !INLINE_NUMBER_KEYS.has(s.key))
                          .map((s) => (
                            <div key={s.key} className="p-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
                              <div className="sm:w-52 flex-shrink-0">
                                <p className="text-sm font-medium">{s.label}</p>
                              </div>
                              {INLINE_NUMBER_PAIRS[s.key] ? (
                                (() => {
                                  const pair = INLINE_NUMBER_PAIRS[s.key];
                                  const countField = settings.find((f) => f.key === pair.countKey);
                                  const enabled = (edits[s.key] ?? s.value ?? s.defaultValue ?? 'false') === 'true';
                                  return (
                                    <div className="flex-1 flex items-center gap-3">
                                      <Toggle
                                        checked={enabled}
                                        onChange={(next) => setEdits((prev) => ({ ...prev, [s.key]: String(next) }))}
                                        ariaLabel={s.label}
                                      />
                                      <input
                                        type="number"
                                        min={pair.min}
                                        value={edits[pair.countKey] ?? countField?.value ?? ''}
                                        onChange={(e) => setEdits((prev) => ({ ...prev, [pair.countKey]: e.target.value }))}
                                        disabled={!enabled}
                                        placeholder={pair.placeholder}
                                        aria-label={pair.aria}
                                        className="w-24 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-500 disabled:opacity-40"
                                      />
                                      <span className={`text-xs ${enabled ? 'text-zinc-500' : 'text-zinc-600'}`}>{pair.unit}</span>
                                    </div>
                                  );
                                })()
                              ) : s.type === 'boolean' && s.key === 'ENABLE_WATCHED_SYNC' && !watchedSyncEligible ? (
                                <div className="flex-1 flex items-center gap-3">
                                  <Toggle checked={false} onChange={() => {}} disabled ariaLabel={s.label} />
                                  {/* Visible instead of a hover-only title tooltip - touch and keyboard users can never see those. */}
                                  <p className="text-xs text-zinc-500">
                                    Needs both Plex and Jellyfin enabled - there&apos;s nothing to sync between just one media server.
                                  </p>
                                </div>
                              ) : s.type === 'boolean' ? (
                                <div className="flex-1 flex items-center">
                                  <Toggle
                                    checked={(edits[s.key] ?? s.value ?? s.defaultValue ?? 'false') === 'true'}
                                    onChange={(next) => setEdits((prev) => ({ ...prev, [s.key]: String(next) }))}
                                    ariaLabel={s.label}
                                  />
                                </div>
                              ) : s.type === 'showlist' ? (
                                <ShowListEditor
                                  value={edits[s.key] ?? s.value ?? ''}
                                  onChange={(v) => {
                                    // Chip add/remove makes "back to the saved value" common -
                                    // drop the edit entirely then, so Save doesn't claim a change.
                                    if (v === (s.value ?? '')) {
                                      setEdits((prev) => {
                                        const next = { ...prev };
                                        delete next[s.key];
                                        return next;
                                      });
                                    } else {
                                      setEdits((prev) => ({ ...prev, [s.key]: v }));
                                    }
                                  }}
                                />
                              ) : s.type === 'profile' ? (
                                (() => {
                                  const profileOptions = testState.profiles ?? [];
                                  const currentValue = edits[s.key] ?? s.value ?? '';
                                  const hasSavedButUnlisted = currentValue && !profileOptions.some((p) => p.name === currentValue);
                                  return (
                                    <div className="flex-1">
                                      <select
                                        value={currentValue}
                                        onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                                        disabled={profileOptions.length === 0}
                                        className="w-full bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        <option value="">
                                          {profileOptions.length ? 'Select a profile…' : 'Test connection to load profiles'}
                                        </option>
                                        {hasSavedButUnlisted && <option value={currentValue}>{currentValue} (saved)</option>}
                                        {profileOptions.map((p) => (
                                          <option key={p.id} value={p.name}>
                                            {p.name}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  );
                                })()
                              ) : (
                                <input
                                  type={s.secret ? 'password' : 'text'}
                                  value={s.secret ? (edits[s.key] ?? '') : (edits[s.key] ?? s.value ?? '')}
                                  disabled={clearedKeys.has(s.key)}
                                  onChange={(e) => {
                                    if (clearedKeys.has(s.key)) {
                                      setClearedKeys((prev) => {
                                        const next = new Set(prev);
                                        next.delete(s.key);
                                        return next;
                                      });
                                    }
                                    setEdits((prev) => ({ ...prev, [s.key]: e.target.value }));
                                  }}
                                  placeholder={
                                    clearedKeys.has(s.key)
                                      ? 'Will be cleared on save'
                                      : s.secret
                                        ? (s.isSet ? 'Set - leave blank to keep' : 'Not set')
                                        : ''
                                  }
                                  className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-500 disabled:opacity-50"
                                />
                              )}
                              {s.info && <InfoTooltip ariaLabel={`About ${s.label}`} text={s.info} />}
                              {s.secret && s.isSet && (
                                <button
                                  type="button"
                                  onClick={() => toggleClear(s.key)}
                                  className={`text-xs font-medium whitespace-nowrap px-2 py-1 rounded-md ${
                                    clearedKeys.has(s.key)
                                      ? 'bg-amber-500 text-black hover:bg-amber-400'
                                      : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
                                  }`}
                                >
                                  {clearedKeys.has(s.key) ? 'Undo' : 'Clear'}
                                </button>
                              )}
                              {s.secret && (
                                <span className={`text-xs font-medium whitespace-nowrap ${s.isSet ? 'text-green-400' : 'text-zinc-500'}`}>
                                  {clearedKeys.has(s.key) ? 'will clear' : s.isSet ? 'set' : 'not set'}
                                </span>
                              )}
                            </div>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <div className="flex items-center gap-3 flex-wrap sticky bottom-4">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving' || changedCount === 0}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveStatus === 'saving' ? 'Saving…' : `Save${changedCount > 0 ? ` (${changedCount} changed)` : ''}`}
        </button>
        {saveStatus === 'error' && <span className="text-sm text-red-400">Failed: {saveError}</span>}

        <button
          onClick={handleRestart}
          disabled={restartStatus === 'restarting'}
          className={`px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-60 ${
            needsRestart
              ? 'bg-amber-500 text-black hover:bg-amber-400 ring-2 ring-amber-300/60'
              : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
          }`}
        >
          {restartStatus === 'restarting' ? 'Restarting…' : 'Restart App'}
        </button>
        {needsRestart && restartStatus !== 'restarting' && (
          <span className="text-sm text-amber-400">Saved. Restart to apply.</span>
        )}
        {restartStatus === 'back' && !needsRestart && <span className="text-sm text-green-400">Restarted, changes are live</span>}
        {restartStatus === 'error' && <span className="text-sm text-red-400">{restartError}</span>}
      </div>
    </div>
  );
}
