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

export default function MenuSettingsPanel() {
  const [settings, setSettings] = useState<SettingStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toggles, setToggles] = useState<Record<string, boolean>>({});
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/settings', { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) {
          setError(data.error);
          return;
        }
        const menuFields = (data.settings as SettingStatus[]).filter((s) => s.group === 'Menu');
        setSettings(menuFields);
        setToggles(Object.fromEntries(menuFields.map((f) => [f.key, f.value !== 'false'])));
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return <p className="text-red-400 text-sm">Failed to load menu settings: {error}</p>;
  }

  if (!settings) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  const changedCount = settings.filter((s) => toggles[s.key] !== (s.value !== 'false')).length;

  async function handleSave() {
    setSaveStatus('saving');
    setSaveError(null);
    const updates = Object.fromEntries(
      settings!
        .filter((s) => toggles[s.key] !== (s.value !== 'false'))
        .map((s) => [s.key, String(toggles[s.key])])
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
      const refreshed = await fetch('/api/settings', { cache: 'no-store' }).then((r) => r.json());
      if (!refreshed.error) {
        const menuFields = (refreshed.settings as SettingStatus[]).filter((s) => s.group === 'Menu');
        setSettings(menuFields);
      }
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
        <p>Choose what shows up in the dashboard&apos;s top menu. Takes effect immediately — no restart needed.</p>
      </div>

      <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800">
        {settings.map((s) => (
          <label key={s.key} className="p-3 flex items-center justify-between gap-3 cursor-pointer">
            <span className="text-sm font-medium">{s.label}</span>
            <button
              type="button"
              role="switch"
              aria-checked={toggles[s.key]}
              onClick={() => setToggles((prev) => ({ ...prev, [s.key]: !prev[s.key] }))}
              className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${
                toggles[s.key] ? 'bg-amber-500' : 'bg-zinc-700'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
                  toggles[s.key] ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </label>
        ))}
      </div>

      <div className="flex items-center gap-3 flex-wrap sticky bottom-4">
        <button
          onClick={handleSave}
          disabled={saveStatus === 'saving' || changedCount === 0}
          className="px-4 py-2 rounded-lg text-sm font-semibold bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {saveStatus === 'saving' ? 'Saving…' : `Save${changedCount > 0 ? ` (${changedCount} changed)` : ''}`}
        </button>
        {saveStatus === 'saved' && <span className="text-sm text-green-400">Saved</span>}
        {saveStatus === 'error' && <span className="text-sm text-red-400">Failed: {saveError}</span>}
      </div>
    </div>
  );
}
