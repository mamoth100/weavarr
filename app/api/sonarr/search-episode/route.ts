import { NextResponse } from 'next/server';
import { searchSonarrEpisode } from '@/lib/sonarr';

export async function POST(request: Request) {
  const { episodeId } = await request.json();
  if (!episodeId) {
    return NextResponse.json({ error: 'episodeId required' }, { status: 400 });
  }

  try {
    await searchSonarrEpisode(episodeId);
    return NextResponse.json({ triggered: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
