import { NextResponse } from 'next/server';
import { getAllSonarrSeries } from '@/lib/sonarr';
import { getExcludedShows } from '@/lib/cleanupCandidates';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function GET() {
  try {
    const series = await getAllSonarrSeries();
    // Protected = on the Cleanup Excluded Shows list: the Library renders a
    // badge instead of a Delete button, and the delete APIs refuse anyway.
    const excluded = getExcludedShows();
    return NextResponse.json({
      series: series.map((s) => ({ ...s, protected: excluded.has(s.title.trim().toLowerCase()) })),
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
