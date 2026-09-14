import { NextResponse } from 'next/server';
import { deleteSonarrSeries } from '@/lib/sonarr';
import { assertSeriesDeletable } from '@/lib/sonarr';
import { refreshTvLibrary } from '@/lib/mediaServer';
import { parsePositiveInt } from '@/lib/params';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const body = await request.json();
  const seriesId = parsePositiveInt(body.seriesId);
  if (seriesId === null) return NextResponse.json({ error: 'seriesId must be a positive integer' }, { status: 400 });

  try {
    await assertSeriesDeletable(seriesId);
    await deleteSonarrSeries(seriesId);
    try {
      await refreshTvLibrary();
    } catch {
      // Deletion already succeeded - a failed library refresh just means it'll
      // notice on its own next scheduled scan instead of immediately.
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
