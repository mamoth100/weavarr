import { NextRequest, NextResponse } from 'next/server';
import { getSonarrSeriesStateByTmdbId } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

/** What Sonarr already has for a TMDB show - the request modal's owned/locked data. seriesId null = not added (modal runs in add mode). */
export async function GET(req: NextRequest) {
  const tmdbId = Number(req.nextUrl.searchParams.get('tmdbId'));
  if (!tmdbId) return NextResponse.json({ error: 'tmdbId required' }, { status: 400 });
  try {
    const state = await getSonarrSeriesStateByTmdbId(tmdbId);
    return NextResponse.json(state ?? { seriesId: null, monitorFuture: false, episodes: [] });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
