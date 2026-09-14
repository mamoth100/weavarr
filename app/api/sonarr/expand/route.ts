import { NextResponse } from 'next/server';
import { expandSonarrSeries } from '@/lib/sonarr';

export const dynamic = 'force-dynamic';

/** "Get more" of an already-added series: newly chosen seasons/episodes get monitored + searched; the future-seasons setting can change. Owned files are never touched. */
export async function POST(request: Request) {
  const body = await request.json();
  const seriesId = Number(body.seriesId);
  if (!seriesId) return NextResponse.json({ error: 'seriesId required' }, { status: 400 });

  // Season 0 = specials, requestable like any other season.
  const seasonNumbers = Array.isArray(body.seasonNumbers)
    ? body.seasonNumbers.map(Number).filter((n: number) => Number.isInteger(n) && n >= 0)
    : [];
  const episodePicks = Array.isArray(body.episodePicks)
    ? body.episodePicks
        .map((p: { seasonNumber?: unknown; episodeNumber?: unknown }) => ({
          seasonNumber: Number(p.seasonNumber),
          episodeNumber: Number(p.episodeNumber),
        }))
        .filter((p: { seasonNumber: number; episodeNumber: number }) => Number.isInteger(p.seasonNumber) && p.seasonNumber >= 0 && Number.isInteger(p.episodeNumber) && p.episodeNumber > 0)
    : [];
  const monitorFuture = typeof body.monitorFuture === 'boolean' ? body.monitorFuture : undefined;
  const unaired = body.unaired === true;

  if (seasonNumbers.length === 0 && episodePicks.length === 0 && monitorFuture === undefined && !unaired) {
    return NextResponse.json({ error: 'nothing to change' }, { status: 400 });
  }

  try {
    await expandSonarrSeries({ seriesId, seasonNumbers, episodePicks, monitorFuture, unaired });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
