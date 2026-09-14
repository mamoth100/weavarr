import { NextResponse } from 'next/server';
import { parsePositiveInt } from '@/lib/params';
import { deleteSonarrSeriesFiles } from '@/lib/sonarr';
import { assertSeriesDeletable } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/** "Episodes only" delete: all files gone, Sonarr registration kept. */
export async function POST(request: Request) {
  const body = await request.json();
  const seriesId = parsePositiveInt(body.seriesId);
  if (seriesId === null) return NextResponse.json({ error: 'seriesId must be a positive integer' }, { status: 400 });
  try {
    await assertSeriesDeletable(seriesId);
    const deleted = await deleteSonarrSeriesFiles(seriesId);
    return NextResponse.json({ deleted });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
