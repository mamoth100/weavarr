import { NextRequest, NextResponse } from 'next/server';
import { getSonarrLookupSeasonPreview } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/** TVDB seasons and episodes for a show not yet in Sonarr - what Sonarr itself would know right after adding it. Feeds the initial-add season picker. */
export async function GET(req: NextRequest) {
  const title = req.nextUrl.searchParams.get('title');
  const imdbId = req.nextUrl.searchParams.get('imdbId');
  const tmdbRaw = Number(req.nextUrl.searchParams.get('tmdbId'));
  const tmdbId = Number.isInteger(tmdbRaw) && tmdbRaw > 0 ? tmdbRaw : null;
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  try {
    return NextResponse.json({ seasons: await getSonarrLookupSeasonPreview(imdbId || null, title, tmdbId) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
