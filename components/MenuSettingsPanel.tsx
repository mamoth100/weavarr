'use client';

import { useEffect, useState } from 'react';
import { GENRE_CATALOG, DEFAULT_GENRE_IDS } from '@/lib/genreCatalog';
import { MENU_LINK_CATALOG, DEFAULT_LINK_IDS } from '@/lib/menuLinks';
import DraggableCheckList, { type DraggableItem } from '@/components/DraggableCheckList';

interface SettingStatus {
  key: string;
  label: string;
  group: string;
  secret: boolean;
  isSet: boolean;
  value: string | null;
}

/** Builds the full working order: saved (checked) ids first in their saved order, then every remaining catalog item in catalog order. */
function buildWorkingOrder(
  catalog: { id: string; label: string }[],
  savedIds: string[]
): DraggableItem[] {
  const savedSet = new Set(savedIds);
  const byId = new Map(catalog.map((c) => [c.id, c.label]));
  const ordered: DraggableItem[] = savedIds
    .filter((id) => byId.has(id))
    .map((id) => ({ id, label: byId.get(id)!, checked: true }));
  for (const c of catalog) {
    if (!savedSet.has(c.id)) ordered.push({ id: c.id, label: c.label, checked: false });
  }
  return ordered;
}

export default function MenuSettingsPanel() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genreItems, setGenreItems] = useState<DraggableItem[]>([]);
  const [linkItems, setLinkItems] = useState<DraggableItem[]>([]);
  const [originalGenres, setOriginalGenres] = useState<string[]>([]);
  const [originalLinks, setOriginalLinks] = useState<string[]>([]);
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
        const genresRaw = menuFields.find((f) => f.key === 'MENU_GENRES')?.value?.trim();
        const linksRaw = menuFields.find((f) => f.key === 'MENU_LINKS')?.value?.trim();
        const genreIds = genresRaw ? genresRaw.split(',').filter(Boolean) : DEFAULT_GENRE_IDS;
        const linkIds = linksRaw ? linksRaw.split(',').filter(Boolean) : DEFAULT_LINK_IDS;
        setOriginalGenres(genreIds);
        setOriginalLinks(linkIds);
        setGenreItems(buildWorkingOrder(GENRE_CATALOG, genreIds));
        setLinkItems(buildWorkingOrder(MENU_LINK_CATALOG, linkIds));
        setLoaded(true);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, []);

  if (error) {
    return <p className="text-red-400 text-sm">Failed to load menu settings: {error}</p>;
  }

  if (!loaded) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-12 bg-zinc-900 rounded-lg animate-pulse" />
        ))}
      </div>
    );
  }

  function reorder(list: DraggableItem[], setList: (items: DraggableItem[]) => void, orderedIds: string[]) {
    const byId = new Map(list.map((it) => [it.id, it]));
    setList(orderedIds.map((id) => byId.get(id)!));
  }

  function toggle(list: DraggableItem[], setList: (items: DraggableItem[]) => void, id: string) {
    setList(list.map((it) => (it.id === id ? { ...it, checked: !it.checked } : it)));
  }

  const currentGenreIds = genreItems.filter((it) => it.checked).map((it) => it.id);
  const currentLinkIds = linkItems.filter((it) => it.checked).map((it) => it.id);
  const genresChanged = currentGenreIds.join(',') !== originalGenres.join(',');
  const linksChanged = currentLinkIds.join(',') !== originalLinks.join(',');
  const changedCount = (genresChanged ? 1 : 0) + (linksChanged ? 1 : 0);

  async function handleSave() {
    setSaveStatus('saving');
    setSaveError(null);
    const updates: Record<string, string> = {};
    if (genresChanged) updates.MENU_GENRES = currentGenreIds.join(',');
    if (linksChanged) updates.MENU_LINKS = currentLinkIds.join(',');
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      setSaveStatus('saved');
      setOriginalGenres(currentGenreIds);
      setOriginalLinks(currentLinkIds);
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
        <p>Drag the grip on the left to reorder. Order here is the order in the dashboard&apos;s top menu — the first genre is what the dashboard shows by default.</p>
        <p>Items that don&apos;t fit in the menu bar automatically fall into a &quot;More&quot; dropdown. Takes effect immediately — no restart needed.</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Genre tabs</h2>
        <DraggableCheckList
          items={genreItems}
          onReorder={(ids) => reorder(genreItems, setGenreItems, ids)}
          onToggle={(id) => toggle(genreItems, setGenreItems, id)}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Other menu items</h2>
        <DraggableCheckList
          items={linkItems}
          onReorder={(ids) => reorder(linkItems, setLinkItems, ids)}
          onToggle={(id) => toggle(linkItems, setLinkItems, id)}
        />
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
