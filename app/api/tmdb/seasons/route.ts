import { NextResponse } from 'next/server';
import { getTvSeasons } from '@/lib/tmdb';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = Number(searchParams.get('id'));
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    const result = await getTvSeasons(id);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
