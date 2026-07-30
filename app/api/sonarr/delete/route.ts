import { NextResponse } from 'next/server';
import { deleteSonarrSeries } from '@/lib/sonarr';
import { refreshPlexTvLibrary } from '@/lib/plex';

export async function POST(request: Request) {
  const { seriesId } = await request.json();
  if (!seriesId) return NextResponse.json({ error: 'seriesId required' }, { status: 400 });

  try {
    await deleteSonarrSeries(seriesId);
    try {
      await refreshPlexTvLibrary();
    } catch {
      // Deletion already succeeded - a failed Plex refresh just means it'll
      // notice on its own next scheduled scan instead of immediately.
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
