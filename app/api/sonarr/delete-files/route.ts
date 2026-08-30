import { NextResponse } from 'next/server';
import { deleteSonarrSeriesFiles } from '@/lib/sonarr';
import { assertSeriesDeletable } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/** "Episodes only" delete: all files gone, Sonarr registration kept. */
export async function POST(request: Request) {
  const { seriesId } = await request.json();
  if (!seriesId) return NextResponse.json({ error: 'seriesId required' }, { status: 400 });
  try {
    await assertSeriesDeletable(Number(seriesId));
    const deleted = await deleteSonarrSeriesFiles(Number(seriesId));
    return NextResponse.json({ deleted });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
