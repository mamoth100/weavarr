import { NextRequest, NextResponse } from 'next/server';
import { getTraktRating } from '@/lib/trakt';

export const dynamic = 'force-dynamic';

/** Trakt rating for one IMDb id, fetched server-side. `rating` is null when Trakt has nothing or is not configured. */
export async function GET(req: NextRequest) {
  const imdbId = req.nextUrl.searchParams.get('imdbId') ?? '';
  if (!/^tt\d{5,10}$/.test(imdbId)) return NextResponse.json({ error: 'imdbId must be an IMDb id like tt0251497' }, { status: 400 });
  try {
    const rating = await getTraktRating(imdbId);
    return NextResponse.json({ rating });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
