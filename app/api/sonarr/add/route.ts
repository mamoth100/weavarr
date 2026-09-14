import { NextResponse } from 'next/server';
import { addSeriesToSonarr } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const { imdbId, tmdbId, title, monitor, seasonNumber, seasonNumbers, episodePicks, monitorFuture, highestQuality, profileOverride, unaired } = await request.json();
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  const tmdb = Number.isInteger(Number(tmdbId)) && Number(tmdbId) > 0 ? Number(tmdbId) : null;
  // Season 0 = specials, requestable like any other season.
  const seasonList = Array.isArray(seasonNumbers)
    ? seasonNumbers.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0)
    : undefined;
  const episodeList = Array.isArray(episodePicks)
    ? episodePicks
        .map((p: { seasonNumber?: unknown; episodeNumber?: unknown }) => ({
          seasonNumber: Number(p.seasonNumber),
          episodeNumber: Number(p.episodeNumber),
        }))
        .filter((p: { seasonNumber: number; episodeNumber: number }) => Number.isInteger(p.seasonNumber) && p.seasonNumber >= 0 && Number.isInteger(p.episodeNumber) && p.episodeNumber > 0)
    : undefined;

  try {
    const result = await addSeriesToSonarr({ imdbId: imdbId ?? null, tmdbId: tmdb, title, monitor, seasonNumber, seasonNumbers: seasonList, episodePicks: episodeList, monitorFuture: Boolean(monitorFuture), highestQuality, profileOverride, unaired: unaired === true });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
