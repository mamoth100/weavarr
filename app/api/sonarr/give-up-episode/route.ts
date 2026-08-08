import { NextResponse } from 'next/server';
import { unmonitorSonarrEpisode } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const { episodeId } = await request.json();
  if (!episodeId) return NextResponse.json({ error: 'episodeId required' }, { status: 400 });

  try {
    await unmonitorSonarrEpisode(episodeId);
    return NextResponse.json({ unmonitored: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
