import { NextResponse } from 'next/server';
import { listRows, upsertRow, deleteRow } from '@/lib/watchlistDb';

export async function GET() {
  return NextResponse.json({ rows: listRows('watched') });
}

export async function POST(request: Request) {
  const row = await request.json();
  upsertRow('watched', row);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const tmdbId = Number(searchParams.get('tmdb_id'));
  const mediaType = searchParams.get('media_type');
  if (!tmdbId || !mediaType) {
    return NextResponse.json({ error: 'tmdb_id and media_type required' }, { status: 400 });
  }
  deleteRow('watched', tmdbId, mediaType);
  return NextResponse.json({ ok: true });
}
