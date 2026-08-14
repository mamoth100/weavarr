import { getAllRadarrMovies } from './radarr';
import { getAllSonarrSeries, getSonarrEpisodeFileSet } from './sonarr';
import { getWatchedMovies, getEpisodeWatchHistory, hasTitle } from './mediaServer';

export interface ReadyToWatchMovie {
  type: 'movie';
  id: number;
  title: string;
  year: number;
  sizeOnDisk: number;
  posterPath: string | null;
}

export interface ReadyToWatchShow {
  type: 'tv';
  id: number;
  title: string;
  year: number;
  unwatchedEpisodes: { seasonNumber: number; episodeNumber: number }[];
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
    Promise.all(showsWithFiles.map((s) => getSonarrEpisodeFileSet(s.id).catch(() => new Set<string>()))),
  ]);

  const movieItems: ReadyToWatchMovie[] = downloadedMovies
    .filter((m, i) => inLibraryFlags[i] && !watchedMovies.some((w) => titlesMatch(w.title, m.title)))
    .map((m) => ({ type: 'movie', id: m.id, title: m.title, year: m.year, sizeOnDisk: m.sizeOnDisk, posterPath: m.posterPath }));

  const showItems: ReadyToWatchShow[] = [];
  showsWithFiles.forEach((s, i) => {
    const fileSet = Array.from(fileSets[i]);
    const watchedKeysForShow = new Set(
      watchedEpisodes
        .filter((w) => titlesMatch(w.showTitle, s.title))
        .map((w) => `${w.seasonNumber}:${w.episodeNumber}`)
    );
    const unwatchedEpisodes = fileSet
      .filter((key) => !watchedKeysForShow.has(key))
      .map((key) => {
        const [seasonNumber, episodeNumber] = key.split(':').map(Number);
        return { seasonNumber, episodeNumber };
      })
      .sort((a, b) => a.seasonNumber - b.seasonNumber || a.episodeNumber - b.episodeNumber);
    if (unwatchedEpisodes.length > 0) {
      showItems.push({
        type: 'tv',
        id: s.id,
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
