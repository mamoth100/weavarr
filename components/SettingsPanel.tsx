'use client';

import { useEffect, useState } from 'react';

interface SettingStatus {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  isSet: boolean;
  value: string | null;
  type?: 'boolean';
}

const TESTABLE_GROUPS = new Set(['Radarr', 'Sonarr', 'SABnzbd', 'Plex', 'Jellyfin', 'TMDB', 'OMDb', 'Trakt', 'Pushover', 'Supabase']);

type TestState = { status: 'idle' | 'testing' | 'ok' | 'fail'; message?: string };

export default function SettingsPanel() {
  const [settings, setSettings] = useState<SettingStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [restartStatus, setRestartStatus] = useState<'idle' | 'restarting' | 'back' | 'error'>('idle');
  const [testStates, setTestStates] = useState<Record<string, TestState>>({});

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setSettings(data.settings);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

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
      setTestStates((prev) => ({ ...prev, [group]: { status: data.ok ? 'ok' : 'fail', message: data.message } }));
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

      {groups.map((group) => {
        const testState = testStates[group] ?? { status: 'idle' as const };
        return (
        <div key={group} className="space-y-2">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">{group}</h2>
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
