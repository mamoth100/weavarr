import { NextResponse } from 'next/server';
import { searchRadarrMovie, recordMovieSearchRequest } from '@/lib/radarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const { movieId } = await request.json();
  if (!movieId) return NextResponse.json({ error: 'movieId required' }, { status: 400 });

  try {
    await searchRadarrMovie(movieId);
    await recordMovieSearchRequest(Number(movieId));
    return NextResponse.json({ triggered: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
