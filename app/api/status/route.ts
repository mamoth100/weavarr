import { NextResponse } from 'next/server';
import { getSabQueue } from '@/lib/sabnzbd';
import { getRadarrQueue, getRadarrRecentImports } from '@/lib/radarr';
import { getSonarrQueue, getSonarrRecentImports } from '@/lib/sonarr';
import { plexHasTitle, plexHasEpisode } from '@/lib/plex';

const RESOLVED_LIMIT = 10;
const POOL_SIZE = 20;

function errMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function GET() {
  const [sab, radarr, sonarr, radarrHistory, sonarrHistory] = await Promise.allSettled([
    getSabQueue(),
    getRadarrQueue(),
    getSonarrQueue(),
    getRadarrRecentImports(POOL_SIZE),
    getSonarrRecentImports(POOL_SIZE),
  ]);

  const importedTitles = [
    ...(radarrHistory.status === 'fulfilled' ? radarrHistory.value : []),
    ...(sonarrHistory.status === 'fulfilled' ? sonarrHistory.value : []),
  ].sort((a, b) => b.date.localeCompare(a.date));

  const checked = await Promise.all(
    importedTitles.map(async (item) => {
      try {
        const inPlex = item.seasonNumber !== undefined && item.episodeNumber !== undefined
          ? await plexHasEpisode(item.title, item.seasonNumber, item.episodeNumber)
          : await plexHasTitle(item.title);
        return { ...item, inPlex };
      } catch {
        return { ...item, inPlex: null };
      }
    })
  );

  // Items already in Plex roll off after the 10 most recent — movies and
  // shows both, whichever's actually most recent wins. Anything NOT yet in
  // Plex (or that failed the check) stays visible no matter how old or how
  // many there are — those are the ones that need attention.
  const resolved = checked.filter((item) => item.inPlex === true).slice(0, RESOLVED_LIMIT);
  const unresolved = checked.filter((item) => item.inPlex !== true);
  const recentImports = [...resolved, ...unresolved].sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({
    sab: sab.status === 'fulfilled' ? sab.value : { error: errMessage(sab.reason) },
    radarr: radarr.status === 'fulfilled' ? radarr.value : { error: errMessage(radarr.reason) },
    sonarr: sonarr.status === 'fulfilled' ? sonarr.value : { error: errMessage(sonarr.reason) },
    recentImports,
  });
}
