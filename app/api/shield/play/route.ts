import { NextResponse } from 'next/server';
import { findPlexEpisodeRatingKey, findPlexMovieRatingKey } from '@/lib/plex';
import { playOnShield } from '@/lib/shieldControl';

export async function POST(request: Request) {
  const { type, title, seasonNumber, episodeNumber } = await request.json();
  if (!type || !title) return NextResponse.json({ error: 'type and title required' }, { status: 400 });
  if (type === 'tv' && (seasonNumber === undefined || episodeNumber === undefined)) {
    return NextResponse.json({ error: 'seasonNumber and episodeNumber required for tv' }, { status: 400 });
  }

  try {
    const ratingKey =
      type === 'movie'
        ? await findPlexMovieRatingKey(title)
        : await findPlexEpisodeRatingKey(title, seasonNumber, episodeNumber);
    if (!ratingKey) throw new Error(`Could not find "${title}" in Plex`);

    await playOnShield(ratingKey);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
