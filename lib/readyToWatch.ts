import { getAllRadarrMovies } from './radarr';
import { getAllSonarrSeries, getSonarrEpisodeFileSet } from './sonarr';
import { getPlexWatchedMovies, getPlexEpisodeWatchHistory, plexHasTitle } from './plex';

export interface ReadyToWatchMovie {
  type: 'movie';
  id: number;
  title: string;
  year: number;
  sizeOnDisk: number;
}

export interface ReadyToWatchShow {
  type: 'tv';
  id: number;
  title: string;
  year: number;
  unwatchedEpisodes: { seasonNumber: number; episodeNumber: number }[];
  sizeOnDisk: number;
}

export type ReadyToWatchItem = ReadyToWatchMovie | ReadyToWatchShow;

export function titleFuzzyMatch(a: string, b: string): boolean {
  const x = a.toLowerCase().trim();
  const y = b.toLowerCase().trim();
  return x === y || x.includes(y) || y.includes(x);
}

export async function getReadyToWatch(): Promise<ReadyToWatchItem[]> {
  const [movies, series, watchedMovies, watchedEpisodes] = await Promise.all([
    getAllRadarrMovies(),
    getAllSonarrSeries(),
    getPlexWatchedMovies(),
    getPlexEpisodeWatchHistory(1000),
  ]);

  const downloadedMovies = movies.filter((m) => m.hasFile);
  const inPlexFlags = await Promise.all(downloadedMovies.map((m) => plexHasTitle(m.title).catch(() => false)));

  const movieItems: ReadyToWatchMovie[] = downloadedMovies
    .filter((m, i) => inPlexFlags[i] && !watchedMovies.some((w) => titleFuzzyMatch(w.title, m.title)))
    .map((m) => ({ type: 'movie', id: m.id, title: m.title, year: m.year, sizeOnDisk: m.sizeOnDisk }));

  const showsWithFiles = series.filter((s) => s.episodeFileCount > 0);
  const fileSets = await Promise.all(
    showsWithFiles.map((s) => getSonarrEpisodeFileSet(s.id).catch(() => new Set<string>()))
  );

  const showItems: ReadyToWatchShow[] = [];
  showsWithFiles.forEach((s, i) => {
    const fileSet = Array.from(fileSets[i]);
    const watchedKeysForShow = new Set(
      watchedEpisodes
        .filter((w) => titleFuzzyMatch(w.showTitle, s.title))
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
      });
    }
  });

  return [...movieItems, ...showItems].sort((a, b) => a.title.localeCompare(b.title));
}
