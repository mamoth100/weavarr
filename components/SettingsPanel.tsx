'use client';

import { useEffect, useState } from 'react';

interface SettingStatus {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  isSet: boolean;
  value: string | null;
}

export default function SettingsPanel() {
  const [settings, setSettings] = useState<SettingStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

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

  const groups = Array.from(new Set(settings.map((s) => s.group)));
  const changedCount = Object.values(edits).filter((v) => v.trim() !== '').length;

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
        <p>Secret fields (API keys, tokens) never show their current value — leave blank to keep it unchanged.</p>
        <p>Every save is backed up first (last 10 kept), so a bad value can always be rolled back.</p>
        <p className="text-amber-400">Changes take effect after the app restarts — ask Claude to redeploy, or restart the service yourself.</p>
      </div>

      {groups.map((group) => (
        <div key={group} className="space-y-2">
          <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">{group}</h2>
          <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800">
            {settings
              .filter((s) => s.group === group)
              .map((s) => (
                <div key={s.key} className="p-3 flex items-center gap-3">
                  <div className="w-52 flex-shrink-0">
                    <p className="text-sm font-medium">{s.label}</p>
                    <p className="text-xs text-zinc-600">{s.key}</p>
                  </div>
                  <input
                    type={s.secret ? 'password' : 'text'}
                    value={s.secret ? (edits[s.key] ?? '') : (edits[s.key] ?? s.value ?? '')}
                    onChange={(e) => setEdits((prev) => ({ ...prev, [s.key]: e.target.value }))}
                    placeholder={s.secret ? (s.isSet ? 'Set — leave blank to keep' : 'Not set') : ''}
                    className="flex-1 bg-zinc-800 text-white text-sm rounded-lg px-3 py-1.5 border border-zinc-700 focus:outline-none focus:border-amber-500 placeholder:text-zinc-600"
                  />
                  {s.secret && (
                    <span className={`text-xs font-medium whitespace-nowrap ${s.isSet ? 'text-green-400' : 'text-zinc-600'}`}>
                      {s.isSet ? '● set' : '○ not set'}
                    </span>
                  )}
                </div>
              ))}
          </div>
        </div>
      ))}

      <div className="flex items-center gap-3 sticky bottom-4">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving' || changedCount === 0}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveStatus === 'saving' ? 'Saving…' : `Save${changedCount > 0 ? ` (${changedCount} changed)` : ''}`}
        </button>
        {saveStatus === 'saved' && <span className="text-sm text-green-400">Saved ✓ — restart the app to apply</span>}
        {saveStatus === 'error' && <span className="text-sm text-red-400">Failed: {saveError}</span>}
      </div>
    </div>
  );
}
