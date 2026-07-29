'use client';

import { useEffect, useState } from 'react';
import { GENRE_CATALOG, DEFAULT_GENRE_IDS } from '@/lib/genreCatalog';

interface SettingStatus {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  isSet: boolean;
  value: string | null;
}

const TOGGLE_FIELDS = [
  { key: 'MENU_SHOW_UPCOMING', label: 'Coming Soon tab' },
  { key: 'MENU_SHOW_SEARCH', label: 'Search tab' },
  { key: 'MENU_SHOW_STATUS', label: 'Status link' },
  { key: 'MENU_SHOW_READY_TO_WATCH', label: 'Ready to Watch link' },
  { key: 'MENU_SHOW_RADARR_LIBRARY', label: 'Movies (Radarr) link' },
  { key: 'MENU_SHOW_SONARR_LIBRARY', label: 'TV (Sonarr) link' },
];

function Switch({ checked, onChange }: { checked: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={onChange}
      className={`relative w-10 h-6 rounded-full transition-colors flex-shrink-0 ${checked ? 'bg-amber-500' : 'bg-zinc-700'}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

export default function MenuSettingsPanel() {
  const [settings, setSettings] = useState<SettingStatus[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedGenres, setSelectedGenres] = useState<string[]>([]);
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
        const genresField = menuFields.find((f) => f.key === 'MENU_GENRES');
        const genresRaw = genresField?.value?.trim();
        setSelectedGenres(genresRaw ? genresRaw.split(',').filter(Boolean) : DEFAULT_GENRE_IDS);
        setToggles(
          Object.fromEntries(
            TOGGLE_FIELDS.map((t) => {
              const field = menuFields.find((f) => f.key === t.key);
              return [t.key, field?.value !== 'false'];
            })
          )
        );
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

  function toggleGenre(id: string) {
    setSelectedGenres((prev) => (prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id]));
  }

  const originalGenresRaw = settings.find((f) => f.key === 'MENU_GENRES')?.value?.trim();
  const originalGenres = originalGenresRaw ? originalGenresRaw.split(',').filter(Boolean) : DEFAULT_GENRE_IDS;
  const genresChanged =
    selectedGenres.length !== originalGenres.length ||
    !selectedGenres.every((id) => originalGenres.includes(id));
  const togglesChangedCount = TOGGLE_FIELDS.filter((t) => {
    const field = settings.find((f) => f.key === t.key);
    return toggles[t.key] !== (field?.value !== 'false');
  }).length;
  const changedCount = togglesChangedCount + (genresChanged ? 1 : 0);

  async function handleSave() {
    setSaveStatus('saving');
    setSaveError(null);
    const updates: Record<string, string> = {};
    if (genresChanged) updates.MENU_GENRES = selectedGenres.join(',');
    for (const t of TOGGLE_FIELDS) {
      const field = settings!.find((f) => f.key === t.key);
      if (toggles[t.key] !== (field?.value !== 'false')) updates[t.key] = String(toggles[t.key]);
    }
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
        setSettings((refreshed.settings as SettingStatus[]).filter((s) => s.group === 'Menu'));
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

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Genre tabs</h2>
        <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800">
          {GENRE_CATALOG.map((g) => (
            <label key={g.id} className="p-3 flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm font-medium">{g.label}</span>
              <Switch checked={selectedGenres.includes(g.id)} onChange={() => toggleGenre(g.id)} />
            </label>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Other menu items</h2>
        <div className="bg-zinc-900 rounded-lg ring-1 ring-white/5 divide-y divide-zinc-800">
          {TOGGLE_FIELDS.map((t) => (
            <label key={t.key} className="p-3 flex items-center justify-between gap-3 cursor-pointer">
              <span className="text-sm font-medium">{t.label}</span>
              <Switch
                checked={toggles[t.key]}
                onChange={() => setToggles((prev) => ({ ...prev, [t.key]: !prev[t.key] }))}
              />
            </label>
          ))}
        </div>
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
