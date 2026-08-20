import { NextResponse } from 'next/server';
import { triggerSonarrEpisodeSearch, recordEpisodeSearchRequest } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/** Search-all for one show's missing episodes - a single Sonarr EpisodeSearch command instead of one per episode. */
export async function POST(request: Request) {
  const { episodeIds, seriesId } = await request.json();
  const ids = Array.isArray(episodeIds) ? episodeIds.map(Number).filter((n: number) => Number.isInteger(n) && n > 0) : [];
  if (ids.length === 0) return NextResponse.json({ error: 'episodeIds required' }, { status: 400 });

  try {
    await triggerSonarrEpisodeSearch(ids);
    // Searching for episodes you don't have is a request - it belongs in the ledger.
    if (seriesId) await recordEpisodeSearchRequest(Number(seriesId), ids);
    return NextResponse.json({ triggered: true, count: ids.length });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
