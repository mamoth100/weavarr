'use client';

import { useEffect, useRef, useState } from 'react';
import Toggle from '@/components/Toggle';

interface SettingStatus {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  isSet: boolean;
  value: string | null;
  type?: 'boolean' | 'profile';
  defaultValue?: 'true' | 'false';
}

interface QualityProfileOption {
  id: number;
  name: string;
}

const TESTABLE_GROUPS = new Set(['Radarr', 'Sonarr', 'SABnzbd', 'NZBGet', 'Plex', 'Jellyfin', 'TMDB', 'OMDb', 'Trakt', 'Pushover', 'Webhook', 'Discord']);

// Where to get a key/token for groups that need one from an external site -
// shown as a hover tooltip next to the group's Test button.
const GROUP_INFO: Record<string, { text: string; linkLabel: string; linkHref: string }> = {
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

function GroupInfoTooltip({ group }: { group: string }) {
  const info = GROUP_INFO[group];
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleOutsideClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') { setOpen(false); }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  if (!info) return null;
  return (
    <div className="relative ml-auto" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-5 h-5 rounded-full text-xs font-bold flex items-center justify-center ${
          open ? 'bg-amber-500 text-black' : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700 hover:text-white'
        }`}
        aria-label={`About ${group}`}
      >
        ?
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-64 bg-zinc-800 border border-zinc-700 rounded-lg shadow-lg p-3 text-xs text-zinc-300">
          <p className="mb-2">{info.text}</p>
          <a
            href={info.linkHref}
            target="_blank"
            rel="noopener noreferrer"
            className="text-amber-400 hover:text-amber-300 font-medium"
          >
            {info.linkLabel} →
          </a>
        </div>
      )}
    </div>
  );
}

// Groups whose quality-profile dropdowns should auto-populate on load if
// already configured, rather than staying greyed out until a manual Test.
const AUTO_TEST_GROUPS = ['Radarr', 'Sonarr'];

// Groups each service's Settings fields into a broader category so the page
// reads as ~7 sections instead of 12 flat, equally-weighted blocks.
const SECTION_ORDER = ['Metadata', 'Media Management', 'Downloaders', 'Media Players', 'Notifications', 'Misc'];
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
  'App Behavior': 'Misc',
};

// Backup gets its own top-level tab in SettingsLayout.tsx (BackupPanel.tsx),
// not a section here - it isn't a "connection" and the user was explicit
// it shouldn't read as one.
const EXCLUDED_GROUPS = new Set(['Backup']);

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string; profiles?: QualityProfileOption[] };

export default function SettingsPanel() {
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
  const [restartStatus, setRestartStatus] = useState<'idle' | 'restarting' | 'back' | 'error'>('idle');
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(SECTION_ORDER));
  const autoTestedRef = useRef(false);

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
        if (data.error) setError(data.error);
        else setSettings(data.settings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  // Quality-profile dropdowns need a live profile list from the service itself -
  // if Radarr/Sonarr are already configured, silently re-run their Test so the
  // dropdowns aren't stuck greyed out every time this page loads.
  useEffect(() => {
    if (!settings || autoTestedRef.current) return;
    autoTestedRef.current = true;
    for (const group of AUTO_TEST_GROUPS) {
      const urlField = settings.find((s) => s.key === `${group.toUpperCase()}_URL`);
      const keyField = settings.find((s) => s.key === `${group.toUpperCase()}_KEY`);
      if (urlField?.isSet && keyField?.isSet) handleTest(group);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

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

  const groups = Array.from(new Set(settings.map((s) => s.group))).filter((g) => g !== 'Menu' && !EXCLUDED_GROUPS.has(g));

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

  async function handleRestart() {
    setRestartStatus('restarting');
    try {
      await fetch('/api/settings/restart', { method: 'POST' });
    } catch {
      // Expected - the request can fail right as the process dies mid-response.
    }
    // Poll until the app answers again, then confirm.
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        if (res.ok) {
          setRestartStatus('back');
          return;
        }
      } catch {
        // still down, keep polling
      }
    }
    setRestartStatus('error');
  }

  async function handleTest(group: string) {
    setTestStates((prev) => ({ ...prev, [group]: { status: 'testing' } }));

    // Trakt's Cloudflare protection blocks server-side requests (confirmed
    // live - same reason TraktScore already runs client-side elsewhere in
    // this app). Has to run from the browser, not through /api/settings/test.
    if (group === 'Trakt') {
      const clientId =
        edits['NEXT_PUBLIC_TRAKT_CLIENT_ID']?.trim() ||
        edits['TRAKT_CLIENT_ID']?.trim() ||
        settings!.find((s) => s.key === 'NEXT_PUBLIC_TRAKT_CLIENT_ID')?.value ||
        '';
      if (!clientId) {
        setTestStates((prev) => ({ ...prev, Trakt: { status: 'fail', message: 'Client ID required' } }));
        return;
      }
      try {
        const res = await fetch('https://api.trakt.tv/shows/trending?limit=1', {
          headers: { 'trakt-api-version': '2', 'trakt-api-key': clientId },
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} - check Client ID`);
        setTestStates((prev) => ({ ...prev, Trakt: { status: 'ok', message: 'Client ID valid' } }));
      } catch (err) {
        setTestStates((prev) => ({
          ...prev,
          Trakt: { status: 'fail', message: err instanceof Error ? err.message : String(err) },
        }));
      }
      return;
    }

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

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
        <p>Secret fields (API keys, tokens) never show their current value - leave blank to keep it unchanged.</p>
        <p>Every save is backed up first (last 10 kept), so a bad value can always be rolled back.</p>
        {/* Only warn about restarting once there's actually something to restart for - a permanent warning is noise. */}
        {(changedCount > 0 || saveStatus === 'saved') && (
          <p className="text-amber-400">Changes need a restart to apply - use the Restart App button below after saving.</p>
        )}
      </div>

      {SECTION_ORDER.map((section) => {
        const sectionGroups = groups.filter((g) => (GROUP_TO_SECTION[g] ?? 'Misc') === section);
        if (sectionGroups.length === 0) return null;
        const sectionCollapsed = collapsedSections.has(section);

        return (
          <div key={section} className="border border-zinc-800 rounded-lg overflow-hidden">
            <button
              onClick={() => toggleSection(section)}
              className="w-full flex items-center gap-2 px-4 py-3 bg-zinc-900 hover:bg-zinc-800/70 text-left"
            >
              <span className={`inline-block transition-transform ${sectionCollapsed ? '-rotate-90' : ''}`}>▾</span>
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">{section}</h2>
            </button>

            {!sectionCollapsed && (
              <div className="p-4 space-y-4">
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
                        <GroupInfoTooltip group={group} />
                      </div>
                      <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800">
                        {settings
                          .filter((s) => s.group === group)
                          .map((s) => (
                            <div key={s.key} className="p-3 flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-3">
                              <div className="sm:w-52 flex-shrink-0">
                                <p className="text-sm font-medium">{s.label}</p>
                              </div>
                              {s.type === 'boolean' && s.key === 'ENABLE_WATCHED_SYNC' && !watchedSyncEligible ? (
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
        {saveStatus === 'saved' && restartStatus === 'idle' && (
          <span className="text-sm text-green-400">Saved</span>
        )}
        {saveStatus === 'error' && <span className="text-sm text-red-400">Failed: {saveError}</span>}

        <button
          onClick={handleRestart}
          disabled={restartStatus === 'restarting'}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-zinc-800 text-zinc-200 hover:bg-zinc-700 disabled:opacity-60"
        >
          {restartStatus === 'restarting' ? 'Restarting…' : 'Restart App'}
        </button>
        {restartStatus === 'back' && <span className="text-sm text-green-400">Back up</span>}
        {restartStatus === 'error' && <span className="text-sm text-red-400">Didn&apos;t come back within 30s - check on the Pi</span>}
      </div>
    </div>
  );
}
