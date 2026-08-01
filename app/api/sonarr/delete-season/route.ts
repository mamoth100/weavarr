import { NextResponse } from 'next/server';
import { deleteSonarrSeasonFiles } from '@/lib/sonarr';
import { refreshTvLibrary } from '@/lib/mediaServer';

export async function POST(request: Request) {
  const { seriesId, seasonNumber } = await request.json();
  if (!seriesId || seasonNumber === undefined) {
    return NextResponse.json({ error: 'seriesId, seasonNumber required' }, { status: 400 });
  }

  try {
    await deleteSonarrSeasonFiles(seriesId, seasonNumber);
    try {
      await refreshTvLibrary();
    } catch {
      // Deletion already succeeded - a failed library refresh just means it'll
      // notice on its own next scheduled scan instead of immediately.
    }
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
