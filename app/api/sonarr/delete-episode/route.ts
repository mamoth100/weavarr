import { NextResponse } from 'next/server';
import { findSonarrEpisodeFile, deleteSonarrEpisodeFile } from '@/lib/sonarr';
import { refreshTvLibrary } from '@/lib/mediaServer';

export async function POST(request: Request) {
  const { seriesId, seasonNumber, episodeNumber } = await request.json();
  if (!seriesId || seasonNumber === undefined || episodeNumber === undefined) {
    return NextResponse.json({ error: 'seriesId, seasonNumber, episodeNumber required' }, { status: 400 });
  }

  try {
    const file = await findSonarrEpisodeFile(seriesId, seasonNumber, episodeNumber);
    if (!file) return NextResponse.json({ error: 'No file found for that episode' }, { status: 404 });

    await deleteSonarrEpisodeFile(file.episodeId, file.episodeFileId);
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
