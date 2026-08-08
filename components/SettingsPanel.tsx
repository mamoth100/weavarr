'use client';

import { useEffect, useRef, useState } from 'react';

interface SettingStatus {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  isSet: boolean;
  value: string | null;
  type?: 'boolean' | 'profile';
}

interface QualityProfileOption {
  id: number;
  name: string;
}

const TESTABLE_GROUPS = new Set(['Radarr', 'Sonarr', 'SABnzbd', 'NZBGet', 'Plex', 'Jellyfin', 'TMDB', 'OMDb', 'Trakt', 'Pushover', 'Webhook', 'Discord']);

// Groups whose quality-profile dropdowns should auto-populate on load if
// already configured, rather than staying greyed out until a manual Test.
const AUTO_TEST_GROUPS = ['Radarr', 'Sonarr'];

// Groups each service's Settings fields into a broader category so the page
// reads as ~7 sections instead of 12 flat, equally-weighted blocks.
const SECTION_ORDER = ['Metadata', 'Media Management', 'Downloaders', 'Media Players', 'Notifications', 'Backup', 'Misc'];
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
  Backup: 'Backup',
  'App Behavior': 'Misc',
};

interface BackupInfo {
  filename: string;
  sizeBytes: number;
  createdAt: string;
}

function formatBackupSize(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(1)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}

function BackupRow({ backup, onDeleted }: { backup: BackupInfo; onDeleted: () => void }) {
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'confirm' | 'loading' | 'done' | 'error'>('idle');
  const [deleteStatus, setDeleteStatus] = useState<'idle' | 'confirm' | 'loading' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  async function handleRestore() {
    setRestoreStatus('loading');
    setError(null);
    try {
      const res = await fetch('/api/backup/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: backup.filename }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Restore failed');
      setRestoreStatus('done');
    } catch (err) {
      setRestoreStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleDelete() {
    setDeleteStatus('loading');
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(backup.filename)}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Delete failed');
      onDeleted();
    } catch (err) {
      setDeleteStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="p-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{backup.filename}</p>
        <p className="text-xs text-zinc-600">
          {new Date(backup.createdAt).toLocaleString()} · {formatBackupSize(backup.sizeBytes)}
        </p>
        {error && <p className="text-xs text-red-400 mt-1">{error}</p>}
      </div>

      <a
        href={`/api/backup/${encodeURIComponent(backup.filename)}`}
        download
        className="px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
      >
        Download
      </a>

      {restoreStatus === 'done' ? (
        <span className="text-xs font-medium text-green-400">Restored - restart to apply</span>
      ) : restoreStatus === 'confirm' || restoreStatus === 'loading' ? (
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-zinc-400">Overwrite current config/data?</span>
          <button
            onClick={handleRestore}
            disabled={restoreStatus === 'loading'}
            className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-60"
          >
            {restoreStatus === 'loading' ? '…' : 'Yes'}
          </button>
          <button
            onClick={() => setRestoreStatus('idle')}
            disabled={restoreStatus === 'loading'}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
          >
            No
          </button>
        </div>
      ) : (
        <button
          onClick={() => setRestoreStatus('confirm')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            restoreStatus === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-amber-500 hover:text-black'
          }`}
        >
          {restoreStatus === 'error' ? 'Failed - retry' : 'Restore'}
        </button>
      )}

      {deleteStatus === 'confirm' || deleteStatus === 'loading' ? (
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleDelete}
            disabled={deleteStatus === 'loading'}
            className="text-xs font-medium text-red-400 hover:text-red-300 disabled:opacity-60"
          >
            {deleteStatus === 'loading' ? '…' : 'Yes'}
          </button>
          <button
            onClick={() => setDeleteStatus('idle')}
            disabled={deleteStatus === 'loading'}
            className="text-xs font-medium text-zinc-400 hover:text-zinc-200 disabled:opacity-60"
          >
            No
          </button>
        </div>
      ) : (
        <button
          onClick={() => setDeleteStatus('confirm')}
          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            deleteStatus === 'error' ? 'bg-red-600 text-white hover:bg-red-500' : 'bg-zinc-800 text-zinc-300 hover:bg-red-600 hover:text-white'
          }`}
        >
          {deleteStatus === 'error' ? 'Failed - retry' : 'Delete'}
        </button>
      )}
    </div>
  );
}

function BackupManager() {
  const [backups, setBackups] = useState<BackupInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function fetchBackups() {
    return fetch('/api/backup', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setBackups(data.backups);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }

  useEffect(() => {
    fetchBackups();
  }, []);

  async function handleBackupNow() {
    setCreating(true);
    setError(null);
    try {
      const res = await fetch('/api/backup', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Backup failed');
      await fetchBackups();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  return (
    <div className="space-y-2 pt-2">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
          Existing Backups{backups && backups.length > 0 ? ` (${backups.length})` : ''}
        </h4>
        <button
          onClick={handleBackupNow}
          disabled={creating}
          className="px-3 py-1.5 rounded-lg text-xs font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-60"
        >
          {creating ? 'Backing up…' : 'Backup Now'}
        </button>
      </div>
      {error && <p className="text-xs text-red-400">{error}</p>}
      {backups && backups.length === 0 && (
        <p className="text-xs text-zinc-600">No backups yet - click Backup Now to create one.</p>
      )}
      {backups && backups.length > 0 && (
        <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800">
          {backups.map((b) => (
            <BackupRow key={b.filename} backup={b} onDeleted={fetchBackups} />
          ))}
        </div>
      )}
    </div>
  );
}

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string; profiles?: QualityProfileOption[] };

export default function SettingsPanel() {
  const [settings, setSettings] = useState<SettingStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
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

  const groups = Array.from(new Set(settings.map((s) => s.group))).filter((g) => g !== 'Menu');
  const changedCount = Object.values(edits).filter((v) => v.trim() !== '').length;

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
      Object.entries(edits).filter(([, v]) => v.trim() !== '')
    );
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
        <p className="text-amber-400">Changes need a restart to apply - use the Restart App button below after saving.</p>
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
                      </div>
                      <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800">
                        {settings
                          .filter((s) => s.group === group)
                          .map((s) => (
                            <div key={s.key} className="p-3 flex items-center gap-3">
                              <div className="w-52 flex-shrink-0">
                                <p className="text-sm font-medium">{s.label}</p>
                                <p className="text-xs text-zinc-600">{s.key}</p>
                              </div>
                              {s.type === 'boolean' ? (
                                <select
                                  value={edits[s.key] ?? s.value ?? 'false'}
                                  onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                                  className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500"
                                >
                                  <option value="true">Enable</option>
                                  <option value="false">Disable</option>
                                </select>
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
                                  onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                                  placeholder={s.secret ? (s.isSet ? 'Set - leave blank to keep' : 'Not set') : ''}
                                  className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
                                />
                              )}
                              {s.secret && (
                                <span className={`text-xs font-medium whitespace-nowrap ${s.isSet ? 'text-green-400' : 'text-zinc-600'}`}>
                                  {s.isSet ? 'set' : 'not set'}
                                </span>
                              )}
                            </div>
                          ))}
                      </div>
                      {group === 'Backup' && <BackupManager />}
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
