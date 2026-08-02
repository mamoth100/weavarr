import { NextResponse } from 'next/server';
import { searchSonarrEpisode } from '@/lib/sonarr';

export async function POST(request: Request) {
  const { episodeId, seriesId, profileOverrideId } = await request.json();
  if (!episodeId) {
    return NextResponse.json({ error: 'episodeId required' }, { status: 400 });
  }

  try {
    await searchSonarrEpisode(episodeId, seriesId, profileOverrideId);
    return NextResponse.json({ triggered: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
