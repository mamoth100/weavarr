'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';

interface CalendarItem {
  type: 'movie' | 'tv';
  id: number;
  tmdbId: number | null;
  title: string;
  subtitle?: string;
  date: string;
  hasFile: boolean;
  hasPoster: boolean;
  watched: boolean;
  monitored: boolean;
}

/** In-app detail page for an entry, when the backing service gave us a TMDB id to link with. */
function itemHref(item: CalendarItem): string | null {
  if (!item.tmdbId) return null;
  return item.type === 'tv' ? `/tv/${item.tmdbId}` : `/documentary/${item.tmdbId}`;
}

/** Same-show episodes stacked on one day collapse to a single chip with a count - "House of Stassi x3" instead of three identical rows. */
interface ChipGroup {
  rep: CalendarItem;
  count: number;
  subtitles: string[];
}

function groupDayItems(dayItems: CalendarItem[]): ChipGroup[] {
  const groups: ChipGroup[] = [];
  const byKey = new Map<string, ChipGroup>();
  for (const item of dayItems) {
    const key = `${item.type}-${item.id}-${itemStatus(item)}`;
    const existing = byKey.get(key);
    if (existing) {
      existing.count += 1;
      if (item.subtitle) existing.subtitles.push(item.subtitle);
    } else {
      const g: ChipGroup = { rep: item, count: 1, subtitles: item.subtitle ? [item.subtitle] : [] };
      byKey.set(key, g);
      groups.push(g);
    }
  }
  return groups;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

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

type ItemStatus = 'watched' | 'downloaded' | 'missing' | 'upcoming';

/**
 * Watched (currently in Plex/Jellyfin, marked watched) always wins, even
 * over hasFile. Missing only fires when Sonarr/Radarr still actually wants
 * the file, hasn't gotten it, AND it's already aired - a true gap. Deleting
 * an item unmonitors it, and Sonarr/Radarr's own calendar excludes
 * unmonitored items by default, so a deleted item just disappears from the
 * calendar entirely rather than showing any status here.
 * Uses each item's own exact timestamp against right now, not "is this whole
 * day in the past" - a day-level check would keep calling something airing
 * this morning "upcoming" until midnight.
 */
function itemStatus(item: CalendarItem): ItemStatus {
  if (item.watched) return 'watched';
  if (item.hasFile) return 'downloaded';
  const aired = new Date(item.date).getTime() <= Date.now();
  if (aired && item.monitored) return 'missing';
  return 'upcoming';
}

function chipClass(item: CalendarItem): string {
  switch (itemStatus(item)) {
    case 'watched': return 'bg-blue-500/15 text-blue-400';
    case 'downloaded': return 'bg-green-500/15 text-green-400';
    case 'missing': return 'bg-red-500/15 text-red-400';
    default: return 'bg-zinc-700/60 text-zinc-400';
  }
}

/** Solid status-dot color for the mobile agenda rows. Full literal class names
 * on purpose - Tailwind only compiles classes it can see as literals in the
 * source, so deriving these from chipClass via string replacement produced
 * class names that don't exist in the built CSS (invisible dots). */
function dotClass(item: CalendarItem): string {
  switch (itemStatus(item)) {
    case 'watched': return 'bg-blue-400';
    case 'downloaded': return 'bg-green-400';
    case 'missing': return 'bg-red-400';
    default: return 'bg-zinc-500';
  }
}

/** Missing (an actual gap) sorts first within a day so it's never buried by a less important item that just happens to also land that day. */
function statusPriority(item: CalendarItem): number {
  switch (itemStatus(item)) {
    case 'missing': return 0;
    case 'watched': return 1;
    case 'downloaded': return 2;
    default: return 3;
  }
}

export default function CalendarPanel() {
  const [monthStart, setMonthStart] = useState(() => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  });
  const [items, setItems] = useState<CalendarItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [today, setToday] = useState(() => new Date());

  const days = useMemo(() => buildGridDays(monthStart), [monthStart]);

  // "today" is only recomputed on a re-render - a tab left open across
  // midnight would otherwise keep highlighting the day it was opened on
  // forever, since nothing else here fires on a timer. Checked every minute
  // (cheap, only actually updates state when the day changes) plus on tab
  // focus, since backgrounded tabs commonly have their intervals throttled.
  useEffect(() => {
    const refreshIfDayChanged = () => {
      setToday((prev) => {
        const now = new Date();
        return isSameDay(prev, now) ? prev : now;
      });
    };
    const interval = setInterval(refreshIfDayChanged, 60000);
    document.addEventListener('visibilitychange', refreshIfDayChanged);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshIfDayChanged);
    };
  }, []);

  // Generation counter so a slow response for a month the user already
  // navigated away from can't overwrite the current month's data (clicking
  // Next twice fast used to let month+1's late reply render into month+2's
  // grid as a silently empty calendar).
  const fetchGeneration = useRef(0);

  useEffect(() => {
    const generation = ++fetchGeneration.current;
    const start = toDateKey(days[0]);
    const end = toDateKey(days[days.length - 1]);
    setItems(null);
    setError(null); // an old month's failure shouldn't stick to the new month
    fetch(`/api/calendar?start=${start}&end=${end}`, { cache: 'no-store' })
      .then((res) => res.json())
      .then((data) => {
        if (generation !== fetchGeneration.current) return;
        if (data.error) setError(data.error);
        else setItems(data.items);
      })
      .catch((err) => {
        if (generation !== fetchGeneration.current) return;
        setError(err instanceof Error ? err.message : String(err));
      });
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
    // A day can genuinely have more items than fit (e.g. a show airing
    // several episodes back to back) - sort so the ones actually worth
    // seeing (a real Missing gap) never end up buried behind "+N more"
    // just because a neutral/unmonitored item happened to load first.
    for (const list of Array.from(map.values())) {
      list.sort((a: CalendarItem, b: CalendarItem) => statusPriority(a) - statusPriority(b));
    }
    return map;
  }, [items]);

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

      {error && (
        <p className="text-red-400 text-sm">
          Failed to load calendar: {error} - use Prev/Next or Today to retry.
        </p>
      )}

      {/* Month grid - desktop only. At phone widths each day cell is ~36px
          wide (verified), which truncates every chip to two letters; the
          agenda list below replaces it there. */}
      <div className={`${error ? 'hidden' : 'hidden lg:grid'} grid-cols-7 gap-px bg-zinc-800 rounded-lg overflow-hidden ring-1 ring-white/5`}>
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
                  : groupDayItems(dayItems).map((g) => {
                      const href = itemHref(g.rep);
                      const label = g.count > 1 ? `${g.rep.title} ×${g.count}` : g.rep.title;
                      const tooltip = g.subtitles.length > 0 ? `${g.rep.title} - ${g.subtitles.join(', ')}` : g.rep.title;
                      const chip = (
                        <div
                          title={tooltip}
                          className={`text-[11px] leading-tight truncate rounded px-1 py-0.5 ${chipClass(g.rep)} ${href ? 'hover:ring-1 hover:ring-white/30' : ''}`}
                        >
                          {label}
                        </div>
                      );
                      const key2 = `${g.rep.type}-${g.rep.id}-${g.rep.date}-${g.rep.subtitle ?? ''}`;
                      return href ? (
                        <Link key={key2} href={href} className="block">
                          {chip}
                        </Link>
                      ) : (
                        <div key={key2}>{chip}</div>
                      );
                    })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Agenda list - phones/tablets. Only days in the current month that
          actually have something, each entry readable at full width with its
          episode info visible (the grid keeps that in a hover tooltip, which
          touch can't see). */}
      <div className={`${error ? 'hidden' : 'lg:hidden'} space-y-3`}>
        {items === null ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 bg-zinc-900 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : (
          (() => {
            const monthDays = days.filter(
              (d) => d.getMonth() === monthStart.getMonth() && (itemsByDay.get(toDateKey(d)) ?? []).length > 0
            );
            if (monthDays.length === 0) {
              return <p className="text-sm text-zinc-500">Nothing airing or releasing this month.</p>;
            }
            return monthDays.map((day) => {
              const key = toDateKey(day);
              const dayItems = itemsByDay.get(key) ?? [];
              const isToday = isSameDay(day, today);
              return (
                <div key={key} className="bg-zinc-900 rounded-lg ring-1 ring-white/5 overflow-hidden">
                  <p className={`px-3 py-2 text-xs font-semibold uppercase tracking-wider border-b border-zinc-800 ${isToday ? 'text-amber-400' : 'text-zinc-500'}`}>
                    {day.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {isToday ? ' · Today' : ''}
                  </p>
                  <div className="divide-y divide-zinc-800">
                    {dayItems.map((item, i) => {
                      const href = itemHref(item);
                      const row = (
                        <div className="px-3 py-2 flex items-center gap-2.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${dotClass(item)}`} />
                          <span className="min-w-0">
                            <span className="block text-sm truncate">{item.title}</span>
                            {item.subtitle && <span className="block text-xs text-zinc-500 truncate">{item.subtitle}</span>}
                          </span>
                        </div>
                      );
                      const key2 = `${item.type}-${item.id}-${item.date}-${item.subtitle ?? i}`;
                      return href ? (
                        <Link key={key2} href={href} className="block hover:bg-zinc-800/60">
                          {row}
                        </Link>
                      ) : (
                        <div key={key2}>{row}</div>
                      );
                    })}
                  </div>
                </div>
              );
            });
          })()
        )}
      </div>
    </div>
  );
}
