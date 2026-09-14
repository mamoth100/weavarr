import { getAllRadarrMovies } from './radarr';
import { getAllSonarrSeries, getSonarrEpisodeFileMap } from './sonarr';
import { getExcludedShows, isExcludedTitle } from './cleanupCandidates';
import { getWatchedMovies, getEpisodeWatchHistory, hasTitle } from './mediaServer';

export interface ReadyToWatchMovie {
  type: 'movie';
  id: number;
  /** For the detail-page link; the id above is the Radarr/Sonarr id. */
  tmdbId: number | null;
  title: string;
  year: number;
  sizeOnDisk: number;
  posterPath: string | null;
}

export interface ReadyToWatchShow {
  type: 'tv';
  id: number;
  tmdbId: number | null;
  /** On the Cleanup Excluded Shows list - no delete affordances. */
  protected: boolean;
  title: string;
  year: number;
  unwatchedEpisodes: { seasonNumber: number; episodeNumber: number; title: string }[];
  sizeOnDisk: number;
  posterPath: string | null;
}

export type ReadyToWatchItem = ReadyToWatchMovie | ReadyToWatchShow;

// Re-exported so existing importers keep working; the implementation moved to
// lib/titleMatch.ts and is now strict equality-after-normalization instead of
// bidirectional substring containment (which matched wrong-but-similar titles
// and fed deletes with the wrong id - see titleMatch.ts).
import { titlesMatch } from './titleMatch';
export { titlesMatch as titleFuzzyMatch };

export async function getReadyToWatch(): Promise<ReadyToWatchItem[]> {
  const [movies, series, watchedMovies, watchedEpisodes] = await Promise.all([
    getAllRadarrMovies(),
    getAllSonarrSeries(),
    getWatchedMovies(),
    getEpisodeWatchHistory(1000),
  ]);

  const downloadedMovies = movies.filter((m) => m.hasFile);
  const showsWithFiles = series.filter((s) => s.episodeFileCount > 0);

  // The movie in-library checks (Plex/Jellyfin) and the per-series episode
  // file fetches (Sonarr) hit different services and don't depend on each
  // other - running them as one batch instead of two sequential awaits cuts
  // end-to-end latency to whichever side is slower rather than their sum.
  const [inLibraryFlags, fileSets] = await Promise.all([
    Promise.all(downloadedMovies.map((m) => hasTitle(m.title).catch(() => false))),
    Promise.all(showsWithFiles.map((s) => getSonarrEpisodeFileMap(s.id).catch(() => new Map<string, string>()))),
  ]);

  const movieItems: ReadyToWatchMovie[] = downloadedMovies
    .filter((m, i) => inLibraryFlags[i] && !watchedMovies.some((w) => titlesMatch(w.title, m.title)))
    .map((m) => ({ type: 'movie' as const, id: m.id, tmdbId: m.tmdbId ?? null, title: m.title, year: m.year, sizeOnDisk: m.sizeOnDisk, posterPath: m.posterPath }));

  const excludedShows = await getExcludedShows();
  const showItems: ReadyToWatchShow[] = [];
  showsWithFiles.forEach((s, i) => {
    const fileMap = fileSets[i];
    const watchedKeysForShow = new Set(
      watchedEpisodes
        .filter((w) => titlesMatch(w.showTitle, s.title))
        .map((w) => `${w.seasonNumber}:${w.episodeNumber}`)
    );
    const unwatchedEpisodes = Array.from(fileMap.entries())
      .filter(([key]) => !watchedKeysForShow.has(key))
      .map(([key, title]) => {
        const [seasonNumber, episodeNumber] = key.split(':').map(Number);
        return { seasonNumber, episodeNumber, title };
      })
      .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
    if (unwatchedEpisodes.length > 0) {
      showItems.push({
        type: 'tv',
        id: s.id,
        tmdbId: s.tmdbId ?? null,
        protected: isExcludedTitle(excludedShows, s.title),
        title: s.title,
        year: s.year,
        unwatchedEpisodes,
        sizeOnDisk: s.sizeOnDisk,
        posterPath: s.posterPath,
      });
    }
  });

  return [...movieItems, ...showItems].sort((a, b) => a.title.localeCompare(b.title));
}
