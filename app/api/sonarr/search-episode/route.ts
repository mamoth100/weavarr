import { NextResponse } from 'next/server';
import { searchSonarrEpisode, recordEpisodeSearchRequest } from '@/lib/sonarr';
import { parsePositiveInt } from '@/lib/params';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const body = await request.json();
  const episodeId = parsePositiveInt(body.episodeId);
  const seriesId = body.seriesId === undefined || body.seriesId === null ? undefined : parsePositiveInt(body.seriesId);
  const profileOverrideId = body.profileOverrideId === undefined || body.profileOverrideId === null ? undefined : parsePositiveInt(body.profileOverrideId);
  if (episodeId === null || seriesId === null || profileOverrideId === null) {
    return NextResponse.json({ error: 'episodeId must be a positive integer; seriesId and profileOverrideId must be positive integers when given' }, { status: 400 });
  }

  try {
    await searchSonarrEpisode(episodeId, seriesId, profileOverrideId);
    // Searching for an episode you don't have is a request - it belongs in the ledger.
    if (seriesId) await recordEpisodeSearchRequest(seriesId, [episodeId]);
    return NextResponse.json({ triggered: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
