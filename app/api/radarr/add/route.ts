import { NextResponse } from 'next/server';
import { addMovieToRadarr } from '@/lib/radarr';

export async function POST(request: Request) {
  const { tmdbId } = await request.json();
  if (!tmdbId) return NextResponse.json({ error: 'tmdbId required' }, { status: 400 });

  try {
    const result = await addMovieToRadarr(tmdbId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
