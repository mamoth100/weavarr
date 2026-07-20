import { NextResponse } from 'next/server';
import { getSabQueue } from '@/lib/sabnzbd';
import { getRadarrQueue, getRadarrRecentImports } from '@/lib/radarr';
import { getSonarrQueue, getSonarrRecentImports } from '@/lib/sonarr';
import { plexHasTitle } from '@/lib/plex';

function errMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function GET() {
  const [sab, radarr, sonarr, radarrHistory, sonarrHistory] = await Promise.allSettled([
    getSabQueue(),
    getRadarrQueue(),
    getSonarrQueue(),
    getRadarrRecentImports(5),
    getSonarrRecentImports(5),
  ]);

  const importedTitles = [
    ...(radarrHistory.status === 'fulfilled' ? radarrHistory.value : []),
    ...(sonarrHistory.status === 'fulfilled' ? sonarrHistory.value : []),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  const recentImports = await Promise.all(
    importedTitles.map(async (item) => {
      try {
        const inPlex = await plexHasTitle(item.title);
        return { ...item, inPlex };
      } catch {
        return { ...item, inPlex: null };
      }
    })
  );

  return NextResponse.json({
    sab: sab.status === 'fulfilled' ? sab.value : { error: errMessage(sab.reason) },
    radarr: radarr.status === 'fulfilled' ? radarr.value : { error: errMessage(radarr.reason) },
    sonarr: sonarr.status === 'fulfilled' ? sonarr.value : { error: errMessage(sonarr.reason) },
    recentImports,
  });
}
