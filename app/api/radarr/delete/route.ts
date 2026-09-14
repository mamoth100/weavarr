import { NextResponse } from 'next/server';
import { parsePositiveInt } from '@/lib/params';
import { deleteRadarrMovie } from '@/lib/radarr';
import { refreshMovieLibrary } from '@/lib/mediaServer';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const body = await request.json();
  const movieId = parsePositiveInt(body.movieId);
  if (movieId === null) return NextResponse.json({ error: 'movieId must be a positive integer' }, { status: 400 });

  try {
    await deleteRadarrMovie(movieId);
    try {
      await refreshMovieLibrary();
    } catch {
      // Deletion already succeeded - a failed library refresh just means it'll
      // notice on its own next scheduled scan instead of immediately.
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
