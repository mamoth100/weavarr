import { NextResponse } from 'next/server';
import { listRows, upsertRow, deleteRow } from '@/lib/watchlistDb';
import { parsePositiveInt } from '@/lib/params';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function GET() {
  return NextResponse.json({ rows: listRows('sucks') });
}

export async function POST(request: Request) {
  const body = await request.json();
  const tmdbId = parsePositiveInt(body?.tmdb_id);
  const mediaType = body?.media_type === 'movie' || body?.media_type === 'tv' ? body.media_type : null;
  const title = typeof body?.title === 'string' ? body.title.trim() : '';
  if (tmdbId === null || !mediaType || !title) {
    return NextResponse.json({ error: 'tmdb_id (positive integer), media_type (movie or tv) and title are required' }, { status: 400 });
  }
  upsertRow('sucks', {
    tmdb_id: tmdbId,
    media_type: mediaType,
    title,
    poster_path: typeof body.poster_path === 'string' && body.poster_path ? body.poster_path : null,
    release_date: typeof body.release_date === 'string' && body.release_date ? body.release_date : null,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId = Number(searchParams.get('tmdb_id'));
  const mediaType = searchParams.get('media_type');
  if (!tmdbId || !mediaType) {
    return NextResponse.json({ error: 'tmdb_id and media_type required' }, { status: 400 });
  }
  deleteRow('sucks', tmdbId, mediaType);
  return NextResponse.json({ ok: true });
}
