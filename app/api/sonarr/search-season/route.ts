import { NextResponse } from 'next/server';
import { searchSonarrSeason } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const { seriesId, seasonNumber, profileOverrideId } = await request.json();
  if (!seriesId || seasonNumber === undefined) {
    return NextResponse.json({ error: 'seriesId, seasonNumber required' }, { status: 400 });
  }

  try {
    await searchSonarrSeason(seriesId, seasonNumber, profileOverrideId);
    return NextResponse.json({ triggered: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
