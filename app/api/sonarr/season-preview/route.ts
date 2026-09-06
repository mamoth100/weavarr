import { NextRequest, NextResponse } from 'next/server';
import { getSonarrLookupSeasonNumbers } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/** TVDB season numbers for a show not yet in Sonarr, via the same lookup the add flow uses - feeds the initial-add season picker. */
export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get('title');
  const imdbId = req.nextUrl.searchParams.get('imdbId');
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  try {
    return NextResponse.json({ seasons: await getSonarrLookupSeasonNumbers(imdbId || null, title) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
