import { NextResponse } from 'next/server';
import { unmonitorSonarrEpisode } from '@/lib/sonarr';

export async function POST(request: Request) {
  const { episodeId } = await request.json();
  if (!episodeId) return NextResponse.json({ error: 'episodeId required' }, { status: 400 });

  try {
    await unmonitorSonarrEpisode(episodeId);
    return NextResponse.json({ unmonitored: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
