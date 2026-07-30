import { NextResponse } from 'next/server';
import { deleteRadarrMovie } from '@/lib/radarr';
import { refreshPlexMovieLibrary } from '@/lib/plex';

export async function POST(request: Request) {
  const { movieId } = await request.json();
  if (!movieId) return NextResponse.json({ error: 'movieId required' }, { status: 400 });

  try {
    await deleteRadarrMovie(movieId);
    try {
      await refreshPlexMovieLibrary();
    } catch {
      // Deletion already succeeded - a failed Plex refresh just means it'll
      // notice on its own next scheduled scan instead of immediately.
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
