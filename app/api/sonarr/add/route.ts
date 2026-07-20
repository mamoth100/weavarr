import { NextResponse } from 'next/server';
import { addSeriesToSonarr } from '@/lib/sonarr';

export async function POST(request: Request) {
  const { imdbId, title, monitor, seasonNumber, highestQuality } = await request.json();
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });

  try {
    const result = await addSeriesToSonarr({ imdbId: imdbId ?? null, title, monitor, seasonNumber, highestQuality });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
