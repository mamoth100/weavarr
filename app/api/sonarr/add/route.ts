import { NextResponse } from 'next/server';
import { addSeriesToSonarr } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const { imdbId, title, monitor, seasonNumber, seasonNumbers, monitorFuture, highestQuality, profileOverride } = await request.json();
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  const seasonList = Array.isArray(seasonNumbers)
    ? seasonNumbers.map(Number).filter((n: number) => Number.isInteger(n) && n > 0)
    : undefined;

  try {
    const result = await addSeriesToSonarr({ imdbId: imdbId ?? null, title, monitor, seasonNumber, seasonNumbers: seasonList, monitorFuture: Boolean(monitorFuture), highestQuality, profileOverride });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
