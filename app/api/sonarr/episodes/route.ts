import { NextResponse } from 'next/server';
import { getSonarrSeriesEpisodes, getProtectedTitle } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  const seriesId = Number(new URL(request.url).searchParams.get('seriesId'));
  if (!seriesId) {
    return NextResponse.json({ error: 'seriesId required' }, { status: 400 });
  }

  try {
    const [episodes, protectedTitle] = await Promise.all([
      getSonarrSeriesEpisodes(seriesId),
      getProtectedTitle(seriesId).catch(() => null),
    ]);
    return NextResponse.json({ episodes, protected: protectedTitle !== null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
