import { NextResponse } from 'next/server';
import { listRows, upsertRow, deleteRow } from '@/lib/watchlistDb';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function GET() {
  return NextResponse.json({ rows: listRows('favorites') });
}

export async function POST(request: Request) {
  const row = await request.json();
  upsertRow('favorites', row);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId = Number(searchParams.get('tmdb_id'));
  const mediaType = searchParams.get('media_type');
  if (!tmdbId || !mediaType) {
    return NextResponse.json({ error: 'tmdb_id and media_type required' }, { status: 400 });
  }
  deleteRow('favorites', tmdbId, mediaType);
  return NextResponse.json({ ok: true });
}
