import { NextResponse } from 'next/server';
import { parsePositiveInt, parseNonNegativeInt } from '@/lib/params';
import { deleteSonarrSeasonFiles, getSeriesDeleteAftermath } from '@/lib/sonarr';
import { assertSeriesDeletable } from '@/lib/sonarr';
import { refreshTvLibrary } from '@/lib/mediaServer';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const body = await request.json();
  const seriesId = parsePositiveInt(body.seriesId);
  const seasonNumber = parseNonNegativeInt(body.seasonNumber);
  if (seriesId === null || seasonNumber === null) {
    return NextResponse.json({ error: 'seriesId and seasonNumber must be integers' }, { status: 400 });
  }

  try {
    await assertSeriesDeletable(seriesId);
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
