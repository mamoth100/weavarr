import { NextResponse } from 'next/server';
import { searchSonarrSeason } from '@/lib/sonarr';

export async function POST(request: Request) {
  const { seriesId, seasonNumber } = await request.json();
  if (!seriesId || seasonNumber === undefined) {
    return NextResponse.json({ error: 'seriesId, seasonNumber required' }, { status: 400 });
  }

  try {
    await searchSonarrSeason(seriesId, seasonNumber);
    return NextResponse.json({ triggered: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
