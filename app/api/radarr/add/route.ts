import { NextResponse } from 'next/server';
import { addMovieToRadarr } from '@/lib/radarr';
import { parsePositiveInt } from '@/lib/params';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const body = await request.json();
  const tmdbId = parsePositiveInt(body.tmdbId);
  if (tmdbId === null) return NextResponse.json({ error: 'tmdbId must be a positive integer' }, { status: 400 });
  const profileOverride = typeof body.profileOverride === 'string' && body.profileOverride.trim() ? body.profileOverride.trim() : undefined;

  try {
    const result = await addMovieToRadarr(tmdbId, body.highestQuality === true, profileOverride);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
