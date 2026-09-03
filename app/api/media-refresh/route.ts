import { NextResponse } from 'next/server';
import { plexEnabled, jellyfinEnabled } from '@/lib/mediaServer';
import * as plex from '@/lib/plex';
import * as jellyfin from '@/lib/jellyfin';

export const dynamic = 'force-dynamic';

/** Force one media player to rescan its libraries so it sees what's actually on disk. The scan itself runs on the server's own time - this just starts it. */
export async function POST(request: Request) {
  const { server } = await request.json();
  try {
    if (server === 'plex') {
      if (!plexEnabled()) return NextResponse.json({ error: 'Plex is not enabled' }, { status: 400 });
      await Promise.all([plex.refreshPlexMovieLibrary(), plex.refreshPlexTvLibrary()]);
    } else if (server === 'jellyfin') {
      if (!jellyfinEnabled()) return NextResponse.json({ error: 'Jellyfin is not enabled' }, { status: 400 });
      await jellyfin.refreshJellyfinLibrary();
    } else {
      return NextResponse.json({ error: 'server must be plex or jellyfin' }, { status: 400 });
    }
    return NextResponse.json({ started: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
