import { NextResponse } from 'next/server';
import { searchRadarrMovie } from '@/lib/radarr';

export async function POST(request: Request) {
  const { movieId } = await request.json();
  if (!movieId) return NextResponse.json({ error: 'movieId required' }, { status: 400 });

  try {
    await searchRadarrMovie(movieId);
    return NextResponse.json({ triggered: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
