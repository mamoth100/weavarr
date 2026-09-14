import { NextResponse } from 'next/server';
import { syncWatchedBetweenServers } from '@/lib/watchedSync';
import { plexEnabled, jellyfinEnabled, refreshMovieLibrary, refreshTvLibrary } from '@/lib/mediaServer';
import { runExclusive } from '@/lib/runExclusive';

export const dynamic = 'force-dynamic';

/**
 * On-demand media-server sync: kicks a library rescan on Plex and Jellyfin
 * (Jellyfin especially misses new files on network shares until scanned)
 * and, when both servers are enabled, runs the watched sync the 5-minute
 * timer normally handles. The rescans are fire-and-started - the servers
 * finish them on their own time.
 */
export async function POST() {
  try {
    const refreshResults = await Promise.allSettled([refreshMovieLibrary(), refreshTvLibrary()]);
    const refreshed = refreshResults.some((r) => r.status === 'fulfilled');
    let marks: number | null = null;
    if (plexEnabled() && jellyfinEnabled()) {
      marks = await runExclusive('watchedSync', syncWatchedBetweenServers);
    }
    return NextResponse.json({ refreshed, marks });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
