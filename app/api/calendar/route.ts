import { NextResponse } from 'next/server';
import { getSonarrCalendar } from '@/lib/sonarr';
import { getRadarrCalendar } from '@/lib/radarr';
import { getWatchedMovies, getEpisodeWatchHistory } from '@/lib/mediaServer';
import { titleFuzzyMatch } from '@/lib/readyToWatch';

export interface CalendarItem {
  type: 'movie' | 'tv';
  id: number;
  title: string;
  subtitle?: string;
  date: string;
  hasFile: boolean;
  hasPoster: boolean;
  /** True if Plex or Jellyfin has this marked watched - takes priority over hasFile, so a watched-then-deleted episode reads as "Watched", not "Missing". */
  watched: boolean;
  /** False if Sonarr/Radarr isn't tracking this anymore - deleting an episode in Weavarr unmonitors it, so an unmonitored+missing item shouldn't read as a gap that needs grabbing. */
  monitored: boolean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  if (!start || !end) return NextResponse.json({ error: 'start and end required' }, { status: 400 });

  const [sonarrResult, radarrResult, watchedMovies, watchedEpisodes] = await Promise.allSettled([
    getSonarrCalendar(start, end),
    getRadarrCalendar(start, end),
    getWatchedMovies().catch(() => []),
    getEpisodeWatchHistory(2000).catch(() => []),
  ]);

  const movieTitlesWatched = watchedMovies.status === 'fulfilled' ? watchedMovies.value : [];
  const episodesWatched = watchedEpisodes.status === 'fulfilled' ? watchedEpisodes.value : [];

  const items: CalendarItem[] = [];

  if (sonarrResult.status === 'fulfilled') {
    for (const e of sonarrResult.value) {
      const watched = episodesWatched.some(
        (w) => w.seasonNumber === e.seasonNumber && w.episodeNumber === e.episodeNumber && titleFuzzyMatch(w.showTitle, e.seriesTitle)
      );
      items.push({
        type: 'tv',
        id: e.seriesId,
        title: e.seriesTitle,
        subtitle: `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} - ${e.title}`,
        date: e.airDateUtc,
        hasFile: e.hasFile,
        hasPoster: e.hasPoster,
        watched,
        monitored: e.monitored,
      });
    }
  }

  if (radarrResult.status === 'fulfilled') {
    for (const m of radarrResult.value) {
      const watched = movieTitlesWatched.some((w) => titleFuzzyMatch(w.title, m.title));
      items.push({
        type: 'movie',
        id: m.movieId,
        title: m.title,
        date: m.releaseDate,
        hasFile: m.hasFile,
        hasPoster: m.hasPoster,
        watched,
        monitored: m.monitored,
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
