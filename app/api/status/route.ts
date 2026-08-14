import { NextResponse } from 'next/server';
import { getDownloaderQueue, downloadersEnabled } from '@/lib/downloaders';
import { getRadarrQueue, getRadarrRecentImports, getAllRadarrMovies } from '@/lib/radarr';
import { getSonarrQueue, getSonarrRecentImports, getAllSonarrSeries, getSonarrEpisodeFileSet } from '@/lib/sonarr';
import { hasTitle, hasEpisode } from '@/lib/mediaServer';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


const RESOLVED_LIMIT = 10;
const POOL_SIZE = 20;

function errMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function GET() {
  const downloaderTask = downloadersEnabled()
    ? getDownloaderQueue().catch((err) => ({ error: errMessage(err) }))
    : Promise.resolve(null);

  const [downloader, [radarr, sonarr, radarrHistory, sonarrHistory, radarrMovies, sonarrSeries]] = await Promise.all([
    downloaderTask,
    Promise.allSettled([
      getRadarrQueue(),
      getSonarrQueue(),
      getRadarrRecentImports(POOL_SIZE),
      getSonarrRecentImports(POOL_SIZE),
      getAllRadarrMovies(),
      getAllSonarrSeries(),
    ]),
  ]);

  const importedTitles = [
    ...(radarrHistory.status === 'fulfilled' ? radarrHistory.value : []),
    ...(sonarrHistory.status === 'fulfilled' ? sonarrHistory.value : []),
  ].sort((a, b) => b.date.localeCompare(a.date));

  // Radarr/Sonarr history is permanent - deleting a movie or episode doesn't
  // remove its import event, so without this check a deleted title would sit
  // in this list forever, stuck as "Not in Plex yet" since Plex will never
  // pick it up. Drop anything whose file is confirmed gone; on lookup failure
  // fail open (keep the item) rather than hide a legitimate pending import.
  const radarrFileMap = radarrMovies.status === 'fulfilled'
    ? new Map(radarrMovies.value.map((m) => [m.id, m.hasFile]))
    : null;
  const existingSeriesIds = sonarrSeries.status === 'fulfilled'
    ? new Set(sonarrSeries.value.map((s) => s.id))
    : null;
  const seriesIdsToCheck = Array.from(new Set(
    importedTitles
      .filter((i) => i.seriesId !== undefined && existingSeriesIds?.has(i.seriesId))
      .map((i) => i.seriesId as number)
  ));
  const episodeFileSets = await Promise.all(
    seriesIdsToCheck.map((id) => getSonarrEpisodeFileSet(id).catch(() => null))
  );
  const seriesFileMap = new Map(seriesIdsToCheck.map((id, i) => [id, episodeFileSets[i]]));

  const stillPresent = importedTitles.filter((item) => {
    if (item.movieId !== undefined) {
      if (!radarrFileMap) return true;
      return radarrFileMap.get(item.movieId) === true;
    }
    if (item.seriesId !== undefined) {
      if (!existingSeriesIds) return true;
      if (!existingSeriesIds.has(item.seriesId)) return false;
      if (item.seasonNumber === undefined || item.episodeNumber === undefined) return true;
      const fileSet = seriesFileMap.get(item.seriesId);
      if (!fileSet) return true;
      return fileSet.has(`${item.seasonNumber}:${item.episodeNumber}`);
    }
    return true;
  });

  const checked = await Promise.all(
    stillPresent.map(async (item) => {
      try {
        const inLibrary = item.seasonNumber !== undefined && item.episodeNumber !== undefined
          ? await hasEpisode(item.title, item.seasonNumber, item.episodeNumber)
          : await hasTitle(item.title);
        return { ...item, inLibrary };
      } catch {
        return { ...item, inLibrary: null };
      }
    })
  );

  // Items already in the library roll off after the 10 most recent - movies
  // and shows both, whichever's actually most recent wins. Anything NOT yet
  // in the library (or that failed the check) stays visible no matter how
  // old or how many there are - those are the ones that need attention.
  const resolved = checked.filter((item) => item.inLibrary === true).slice(0, RESOLVED_LIMIT);
  const unresolved = checked.filter((item) => item.inLibrary !== true);
  const recentImports = [...resolved, ...unresolved].sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json({
    downloader,
    radarr: radarr.status === 'fulfilled' ? radarr.value : { error: errMessage(radarr.reason) },
    sonarr: sonarr.status === 'fulfilled' ? sonarr.value : { error: errMessage(sonarr.reason) },
    recentImports,
  });
}
