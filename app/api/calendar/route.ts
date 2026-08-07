import { NextResponse } from 'next/server';
import { getSonarrCalendar } from '@/lib/sonarr';
import { getRadarrCalendar } from '@/lib/radarr';

export interface CalendarItem {
  type: 'movie' | 'tv';
  id: number;
  title: string;
  subtitle?: string;
  date: string;
  hasFile: boolean;
  hasPoster: boolean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  const [sonarrResult, radarrResult] = await Promise.allSettled([
    getSonarrCalendar(start, end),
    getRadarrCalendar(start, end),
  ]);

  const items: CalendarItem[] = [];

  if (sonarrResult.status === 'fulfilled') {
    for (const e of sonarrResult.value) {
      items.push({
        type: 'tv',
        id: e.seriesId,
        title: e.seriesTitle,
        subtitle: `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} - ${e.title}`,
        date: e.airDateUtc,
        hasFile: e.hasFile,
        hasPoster: e.hasPoster,
      });
    }
  }

  if (radarrResult.status === 'fulfilled') {
    for (const m of radarrResult.value) {
      items.push({
        type: 'movie',
        id: m.movieId,
        title: m.title,
        date: m.releaseDate,
        hasFile: m.hasFile,
        hasPoster: m.hasPoster,
      });
    }
  }

  items.sort((a, b) => a.date.localeCompare(b.date));

  // Only error out if BOTH failed - a single misconfigured service
  // shouldn't blank the whole calendar for the other one.
  if (sonarrResult.status === 'rejected' && radarrResult.status === 'rejected') {
    return NextResponse.json({ error: sonarrResult.reason?.message ?? 'Calendar failed' }, { status: 500 });
  }

  return NextResponse.json({ items });
}
