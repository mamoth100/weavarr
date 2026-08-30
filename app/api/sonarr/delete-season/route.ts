import { NextResponse } from 'next/server';
import { deleteSonarrSeasonFiles, getSeriesDeleteAftermath } from '@/lib/sonarr';
import { assertSeriesDeletable } from '@/lib/sonarr';
import { refreshTvLibrary } from '@/lib/mediaServer';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const { seriesId, seasonNumber } = await request.json();
  if (!seriesId || seasonNumber === undefined) {
    return NextResponse.json({ error: 'seriesId, seasonNumber required' }, { status: 400 });
  }

  try {
    await assertSeriesDeletable(Number(seriesId));
    await deleteSonarrSeasonFiles(seriesId, seasonNumber);
    try {
      await refreshTvLibrary();
    } catch {
      // Deletion already succeeded - a failed library refresh just means it'll
      // notice on its own next scheduled scan instead of immediately.
    }
    // The aftermath drives the "that was the last episode" prompt - a
    // failure here must not fail the delete that already happened.
    const after = await getSeriesDeleteAftermath(Number(seriesId)).catch(() => null);
    return NextResponse.json({ deleted: true, after });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
