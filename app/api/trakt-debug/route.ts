import { NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/fetchTimeout';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const imdbId = searchParams.get('imdb') ?? 'tt40792117';

  const clientId = process.env.TRAKT_CLIENT_ID;
  if (!clientId) {
    return NextResponse.json({ error: 'TRAKT_CLIENT_ID not set' }, { status: 500 });
  }

  const headers = {
    'Content-Type': 'application/json',
    'trakt-api-version': '2',
    'trakt-api-key': clientId,
  };

  try {
    const movieRes = await fetchWithTimeout(`https://api.trakt.tv/movies/${imdbId}`, {
      headers,
      cache: 'no-store',
    });
    const movieBody = movieRes.ok ? await movieRes.json() : await movieRes.text();

    const ratingsRes = await fetchWithTimeout(`https://api.trakt.tv/movies/${imdbId}/ratings`, {
      headers,
      cache: 'no-store',
    });
    const ratingsBody = ratingsRes.ok ? await ratingsRes.json() : await ratingsRes.text();

    return NextResponse.json({
      keyLength: clientId.length,
      keyPrefix: clientId.slice(0, 6) + '...',
      movieStatus: movieRes.status,
      movieSlug: movieBody?.ids?.slug ?? null,
      ratingsStatus: ratingsRes.status,
      ratings: ratingsBody,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
