import { NextResponse } from 'next/server';
import { getSonarrSeriesEpisodes } from '@/lib/sonarr';

export async function GET(request: Request) {
  const seriesId = Number(new URL(request.url).searchParams.get('seriesId'));
  if (!seriesId) {
    return NextResponse.json({ error: 'seriesId required' }, { status: 400 });
  }

  try {
    const episodes = await getSonarrSeriesEpisodes(seriesId);
    return NextResponse.json({ episodes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
