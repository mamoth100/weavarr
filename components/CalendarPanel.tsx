'use client';

import { useEffect, useMemo, useState } from 'react';

interface CalendarItem {
  type: 'movie' | 'tv';
  id: number;
  title: string;
  subtitle?: string;
  date: string;
  hasFile: boolean;
  hasPoster: boolean;
  watched: boolean;
  monitored: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MAX_CHIPS_PER_DAY = 3;

function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

/** The visible grid always shows full weeks, so it pads a few days from the previous/next month at either end. */
function buildGridDays(monthStart: Date): Date[] {
  const gridStart = new Date(monthStart);
  gridStart.setDate(gridStart.getDate() - gridStart.getDay());

  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
  const gridEnd = new Date(monthEnd);
  gridEnd.setDate(gridEnd.getDate() + (6 - gridEnd.getDay()));

  const days: Date[] = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

/**
 * Watched (Plex/Jellyfin confirmed) always wins, even over hasFile - that's
 * what keeps a watched-then-deleted episode reading as "Watched" instead of
 * "Missing". Unmonitored (deleting an episode in Weavarr unmonitors it) is
 * the fallback safety net for cases watch history can't confirm: it just
 * keeps things neutral rather than red, since Sonarr/Radarr have been told
 * not to care about it either. Missing only fires when Sonarr/Radarr still
 * actually wants the file and doesn't have it - the true gap.
 * Uses each item's own exact timestamp against right now, not "is this whole
 * day in the past" - a day-level check would keep calling something airing
 * this morning "upcoming" until midnight.
 */
function chipClass(item: CalendarItem): string {
  if (item.watched) return 'bg-blue-500/15 text-blue-400';
  if (item.hasFile) return 'bg-green-500/15 text-green-400';
  const aired = new Date(item.date).getTime() <= Date.now();
  if (aired && item.monitored) return 'bg-red-500/15 text-red-400';
  return 'bg-zinc-700/60 text-zinc-400';
}

export default function CalendarPanel() {
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const days = useMemo(() => buildGridDays(monthStart), [monthStart]);

  useEffect(() => {
    const start = toDateKey(days[0]);
    const end = toDateKey(days[days.length - 1]);
    setItems(null);
    fetch(`/api/calendar?start=${start}&end=${end}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setItems(data.items);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthStart]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of items ?? []) {
      const key = toDateKey(new Date(item.date));
      const list = map.get(key) ?? [];
      list.push(item);
      map.set(key, list);
    }
    return map;
  }, [items]);

  if (error) {
    return <p className="text-red-400 text-sm">Failed to load calendar: {error}</p>;
  }

  const today = new Date();
  const monthLabel = monthStart.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{monthLabel}</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() - 1, 1))}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Prev
          </button>
          <button
            onClick={() => setMonthStart(new Date(today.getFullYear(), today.getMonth(), 1))}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Today
          </button>
          <button
            onClick={() => setMonthStart(new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1))}
            className="px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-800 text-zinc-300 hover:bg-zinc-700"
          >
            Next
          </button>
        </div>
      </div>

      <div className="flex items-center gap-4 text-xs text-zinc-500">
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-blue-500/40" /> Watched</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-green-500/40" /> Downloaded</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-red-500/40" /> Missing</span>
        <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-zinc-600" /> Upcoming</span>
      </div>

      <div className="grid grid-cols-7 gap-px bg-zinc-800 rounded-lg overflow-hidden ring-1 ring-white/5">
        {WEEKDAYS.map((d) => (
          <div key={d} className="bg-zinc-900 text-center text-xs font-semibold text-zinc-500 uppercase tracking-wider py-2">
            {d}
          </div>
        ))}
        {days.map((day) => {
          const key = toDateKey(day);
          const dayItems = itemsByDay.get(key) ?? [];
          const inMonth = day.getMonth() === monthStart.getMonth();
          const isToday = isSameDay(day, today);
          const shown = dayItems.slice(0, MAX_CHIPS_PER_DAY);
          const remaining = dayItems.length - shown.length;

          return (
            <div
              key={key}
              className={`bg-zinc-900 min-h-[92px] p-1.5 ${inMonth ? '' : 'opacity-40'}`}
            >
              <p className={`text-xs mb-1 ${isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-500 text-black font-bold' : 'text-zinc-500'}`}>
                {day.getDate()}
              </p>
              <div className="space-y-0.5">
                {items === null
                  ? null
                  : shown.map((item) => (
                      <div
                        key={`${item.type}-${item.id}-${item.date}`}
                        title={`${item.title}${item.subtitle ? ` - ${item.subtitle}` : ''}`}
                        className={`text-[10px] leading-tight truncate rounded px-1 py-0.5 ${chipClass(item)}`}
                      >
                        {item.title}
                      </div>
                    ))}
                {remaining > 0 && <p className="text-[10px] text-zinc-600 px-1">+{remaining} more</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
