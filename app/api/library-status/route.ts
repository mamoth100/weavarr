import { NextResponse } from 'next/server';
import { getAllRadarrMovies } from '@/lib/radarr';
import { getAllSonarrSeries } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

export type Availability = 'available' | 'partial' | 'requested';

/**
 * TMDB-id -> library status for every movie/show Radarr/Sonarr manage, so
 * browse cards can show "you already have this" at a glance (Seerr-style
 * availability badges). allSettled per service: one backend down just means
 * its half of the badges is absent, not an error page.
 */
export async function GET() {
  const [moviesR, seriesR] = await Promise.allSettled([getAllRadarrMovies(), getAllSonarrSeries()]);

  const movies: Record<number, Availability> = {};
  if (moviesR.status === 'fulfilled') {
    for (const m of moviesR.value) {
      if (m.tmdbId) movies[m.tmdbId] = m.hasFile ? 'available' : 'requested';
    }
  }

  const shows: Record<number, Availability> = {};
  if (seriesR.status === 'fulfilled') {
    for (const s of seriesR.value) {
      if (!s.tmdbId) continue;
      shows[s.tmdbId] =
        s.episodeCount > 0 && s.episodeFileCount >= s.episodeCount
          ? 'available'
          : s.episodeFileCount > 0
            ? 'partial'
            : 'requested';
    }
  }

  return NextResponse.json({ movies, shows });
}
