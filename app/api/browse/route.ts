import { NextRequest, NextResponse } from 'next/server';
import { parseBrowseParams, fetchBrowsePage } from '@/lib/browse';

export const dynamic = 'force-dynamic';

/** Pages 2+ for the infinite-scroll browse grid - page 1 arrives server-rendered from app/page.tsx via the same lib/browse logic. */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  try {
    const args = await parseBrowseParams({
      subgenres: sp.get('subgenres') ?? undefined,
      sort: sp.get('sort') ?? undefined,
      q: sp.get('q') ?? undefined,
      decade: sp.get('decade') ?? undefined,
      genre: sp.get('genre') ?? undefined,
      upcomingGenre: sp.get('upcomingGenre') ?? undefined,
      lang: sp.get('lang') ?? undefined,
      year: sp.get('year') ?? undefined,
    });
    return NextResponse.json(await fetchBrowsePage(args, page));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Browse fetch failed' },
      { status: 500 }
    );
  }
}
