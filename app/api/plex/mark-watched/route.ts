import { NextResponse } from 'next/server';
import { markMovieWatched, markEpisodesWatched } from '@/lib/mediaServer';

export async function POST(request: Request) {
  const body = await request.json();

  try {
    if (body.type === 'movie') {
      if (!body.title) return NextResponse.json({ error: 'title required' }, { status: 400 });
      await markMovieWatched(body.title);
    } else if (body.type === 'tv') {
      if (!body.title || !Array.isArray(body.episodes)) {
        return NextResponse.json({ error: 'title and episodes required' }, { status: 400 });
      }
      await markEpisodesWatched(body.title, body.episodes);
    } else {
      return NextResponse.json({ error: 'type must be "movie" or "tv"' }, { status: 400 });
    }
    return NextResponse.json({ marked: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
