import { NextRequest, NextResponse } from 'next/server';
import { getTvSeasonEpisodes } from '@/lib/tmdb';

export const dynamic = 'force-dynamic';

/** Episode list for one season of a show - lazy-loaded when a modal season row expands. */
export async function GET(req: NextRequest) {
  const id = Number(req.nextUrl.searchParams.get('id'));
  const season = Number(req.nextUrl.searchParams.get('season'));
  if (!id || !Number.isInteger(season) || season < 1) {
    return NextResponse.json({ error: 'id and season required' }, { status: 400 });
  }
  try {
    return NextResponse.json({ episodes: await getTvSeasonEpisodes(id, season) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
