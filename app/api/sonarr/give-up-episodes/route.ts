import { NextResponse } from 'next/server';
import { monitorSonarrEpisodes } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/** Give-up-all for one show's missing episodes - unmonitors the whole batch in one Sonarr call so it stops searching. Nothing on disk to delete. */
export async function POST(request: Request) {
  const { episodeIds } = await request.json();
  const ids = Array.isArray(episodeIds) ? episodeIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'episodeIds required' }, { status: 400 });

  try {
    await monitorSonarrEpisodes(ids, false);
    return NextResponse.json({ unmonitored: true, count: ids.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
