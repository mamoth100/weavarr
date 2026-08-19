'use client';

import { useEffect, useState } from 'react';
import { GENRE_CATALOG, DEFAULT_GENRE_IDS, ALL_GENRES_ID } from '@/lib/genreCatalog';
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

/** null (never saved) means "not configured yet" -> use defaults. An explicit empty string means the user deliberately chose zero items. */
function parseSavedIds(value: string | null | undefined, defaults: string[]): string[] {
  if (value === null || value === undefined) return defaults;
  return value.trim() === '' ? [] : value.split(',').map((s) => s.trim()).filter(Boolean);
}

/** Genres must never be fully empty — All Genres steps in as the fallback. */
function enforceAtLeastOneGenre(ids: string[]): string[] {
  return ids.length === 0 ? [ALL_GENRES_ID] : ids;
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

// The sidebar renders links in two groups (Browse = 'tab' kind after the
// genre tabs, Manage = 'link' kind), so the settings lists mirror that split.
// Storage stays one MENU_LINKS value - tabs first, then pages.
const TAB_CATALOG = MENU_LINK_CATALOG.filter((l) => l.kind === 'tab');
const PAGE_CATALOG = MENU_LINK_CATALOG.filter((l) => l.kind === 'link');
const TAB_IDS = new Set(TAB_CATALOG.map((l) => l.id));

export default function MenuSettingsPanel() {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [genreItems, setGenreItems] = useState<DraggableItem[]>([]);
  const [tabItems, setTabItems] = useState<DraggableItem[]>([]);
  const [pageItems, setPageItems] = useState<DraggableItem[]>([]);
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
        const genreIds = enforceAtLeastOneGenre(parseSavedIds(menuFields.find((f) => f.key === 'MENU_GENRES')?.value, DEFAULT_GENRE_IDS));
        const linkIds = parseSavedIds(menuFields.find((f) => f.key === 'MENU_LINKS')?.value, DEFAULT_LINK_IDS);
        setOriginalGenres(genreIds);
        setOriginalLinks(linkIds);
        setGenreItems(buildWorkingOrder(GENRE_CATALOG, genreIds));
        setTabItems(buildWorkingOrder(TAB_CATALOG, linkIds.filter((id) => TAB_IDS.has(id))));
        setPageItems(buildWorkingOrder(PAGE_CATALOG, linkIds.filter((id) => !TAB_IDS.has(id))));
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

  /** Same as toggle, but genres may never all end up unchecked -> All Genres steps back in automatically. */
  function toggleGenre(id: string) {
    setGenreItems((prev) => {
      let next = prev.map((it) => (it.id === id ? { ...it, checked: !it.checked } : it));
      if (!next.some((it) => it.checked)) {
        next = next.map((it) => (it.id === ALL_GENRES_ID ? { ...it, checked: true } : it));
      }
      return next;
    });
  }

  const genreCheckedCount = genreItems.filter((it) => it.checked).length;
  const onlyAllGenresChecked = genreCheckedCount === 1 && genreItems.find((it) => it.checked)?.id === ALL_GENRES_ID;
  const displayGenreItems = genreItems.map((it) =>
    it.id === ALL_GENRES_ID ? { ...it, disabled: onlyAllGenresChecked } : it
  );

  const currentGenreIds = genreItems.filter((it) => it.checked).map((it) => it.id);
  const currentLinkIds = [...tabItems, ...pageItems].filter((it) => it.checked).map((it) => it.id);
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
      // The nav (Sidebar/SidebarNav) only fetches /api/menu once on mount -
      // without a reload it keeps showing the stale menu it already loaded,
      // even though the save itself took effect immediately.
      window.location.reload();
    } catch (err) {
      setSaveStatus('error');
      setSaveError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="space-y-6">
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-400 space-y-1">
        <p>Drag the grip on the left to reorder. The sections below mirror the sidebar&apos;s groups - Browse first (genres, then browse views), then Manage.</p>
        <p>The first genre is what the dashboard shows by default. Takes effect on save - no restart needed.</p>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Browse - genres</h2>
        <DraggableCheckList
          items={displayGenreItems}
          onReorder={(ids) => reorder(genreItems, setGenreItems, ids)}
          onToggle={toggleGenre}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Browse - views</h2>
        <p className="text-xs text-zinc-500">Shown under Browse, after the genres.</p>
        <DraggableCheckList
          items={tabItems}
          onReorder={(ids) => reorder(tabItems, setTabItems, ids)}
          onToggle={(id) => toggle(tabItems, setTabItems, id)}
        />
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Manage - pages</h2>
        <DraggableCheckList
          items={pageItems}
          onReorder={(ids) => reorder(pageItems, setPageItems, ids)}
          onToggle={(id) => toggle(pageItems, setPageItems, id)}
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
