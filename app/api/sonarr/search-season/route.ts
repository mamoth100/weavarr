import { NextResponse } from 'next/server';
import { searchSonarrSeason } from '@/lib/sonarr';
import { parsePositiveInt, parseNonNegativeInt } from '@/lib/params';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const body = await request.json();
  const seriesId = parsePositiveInt(body.seriesId);
  const seasonNumber = parseNonNegativeInt(body.seasonNumber);
  const profileOverrideId = body.profileOverrideId === undefined || body.profileOverrideId === null ? undefined : parsePositiveInt(body.profileOverrideId);
  if (seriesId === null || seasonNumber === null || profileOverrideId === null) {
    return NextResponse.json({ error: 'seriesId and seasonNumber must be integers; profileOverrideId must be a positive integer when given' }, { status: 400 });
  }

  try {
    await searchSonarrSeason(seriesId, seasonNumber, profileOverrideId);
    return NextResponse.json({ triggered: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
