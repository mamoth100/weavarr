import { NextResponse } from 'next/server';
import { getRequestRows } from '@/lib/requestLedger';
import { getAllRadarrMovies, radarrMovieWasImported } from '@/lib/radarr';
import { getAllSonarrSeries, getSonarrSeriesEpisodes, sonarrEpisodeWasImported } from '@/lib/sonarr';
import { getDownloadProgress } from '@/lib/downloadProgress';

export const dynamic = 'force-dynamic';

/** "SnEm" labels out of the stored seasons field (a JSON array mixing whole-season numbers and episode strings). */
function episodePicksFrom(seasons: string | null): { s: number; e: number }[] {
  if (!seasons) return [];
  try {
    const parsed = JSON.parse(seasons);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((v) => (typeof v === 'string' ? v.match(/^S(\d+)E(\d+)$/i) : null))
      .filter((m): m is RegExpMatchArray => m !== null)
      .map((m) => ({ s: Number(m[1]), e: Number(m[2]) }));
  } catch {
    return [];
  }
}

/**
 * The ledger rows plus a LIVE status join - nothing about the present is
 * stored, so nothing can drift: downloading comes from the queues, available
 * from the arr libraries, removed from absence. A request whose file was
 * imported and later deleted reads "fulfilled" via the arr's own import
 * history - deletion is a finished story, not something still being hunted.
 * A failed library listing degrades those rows to "unknown" rather than
 * lying with "removed".
 */
export async function GET() {
  const [movies, series, progress] = await Promise.allSettled([
    getAllRadarrMovies(),
    getAllSonarrSeries(),
    getDownloadProgress(),
  ]);

  const radarrOk = movies.status === 'fulfilled';
  const sonarrOk = series.status === 'fulfilled';
  const movieByTmdb = new Map(radarrOk ? movies.value.map((m) => [m.tmdbId, m]) : []);
  const showByTmdb = new Map(sonarrOk ? series.value.filter((s) => s.tmdbId).map((s) => [s.tmdbId as number, s]) : []);
  const showByTvdb = new Map(sonarrOk ? series.value.filter((s) => s.tvdbId).map((s) => [s.tvdbId as number, s]) : []);
  const prog = progress.status === 'fulfilled' ? progress.value : { movies: {}, shows: {} };

  // One episode-list fetch per distinct series and one history check per
  // distinct episode/movie, shared across rows.
  const episodeCache = new Map<number, Promise<{ id: number; seasonNumber: number; episodeNumber: number; hasFile: boolean }[] | null>>();
  function seriesEpisodes(seriesId: number) {
    let cached = episodeCache.get(seriesId);
    if (!cached) {
      cached = getSonarrSeriesEpisodes(seriesId).catch(() => null);
      episodeCache.set(seriesId, cached);
    }
    return cached;
  }
  const importCache = new Map<string, Promise<boolean>>();
  function wasImported(kind: 'episode' | 'movie', id: number) {
    const key = `${kind}:${id}`;
    let cached = importCache.get(key);
    if (!cached) {
      cached = (kind === 'episode' ? sonarrEpisodeWasImported(id) : radarrMovieWasImported(id)).catch(() => false);
      importCache.set(key, cached);
    }
    return cached;
  }

  const requests = await Promise.all(
    getRequestRows().map(async (row) => {
      let status: 'downloading' | 'importing' | 'searching' | 'available' | 'partial' | 'fulfilled' | 'removed' | 'unknown';
      let percent: number | null = null;

      const p = row.mediaType === 'movie'
        ? (row.tmdbId ? prog.movies[row.tmdbId] : undefined)
        : (row.tmdbId ? prog.shows[row.tmdbId] : undefined);

      if (p) {
        status = p.state === 'importing' ? 'importing' : 'downloading';
        percent = p.percent;
      } else if (row.mediaType === 'movie') {
        if (!radarrOk) status = 'unknown';
        else {
          const m = row.tmdbId ? movieByTmdb.get(row.tmdbId) : undefined;
          if (!m) status = 'removed';
          else if (m.hasFile) status = 'available';
          else status = (await wasImported('movie', m.id)) ? 'fulfilled' : 'searching';
        }
      } else {
        if (!sonarrOk) status = 'unknown';
        else {
          const s = (row.tmdbId ? showByTmdb.get(row.tmdbId) : undefined) ?? (row.tvdbId ? showByTvdb.get(row.tvdbId) : undefined);
          const picks = episodePicksFrom(row.seasons);
          if (s && picks.length > 0) {
            // Episode-scoped request: judge exactly the episodes asked for,
            // not the show's overall file count.
            const eps = await seriesEpisodes(s.id);
            if (eps === null) status = 'unknown';
            else {
              const wanted = eps.filter((e) => picks.some((pk) => pk.s === e.seasonNumber && pk.e === e.episodeNumber));
              const withFiles = wanted.filter((e) => e.hasFile).length;
              if (withFiles >= picks.length && picks.length > 0) status = 'available';
              else {
                const missing = wanted.filter((e) => !e.hasFile);
                const imported = await Promise.all(missing.map((e) => wasImported('episode', e.id)));
                if (missing.length > 0 && imported.every(Boolean)) status = withFiles > 0 ? 'partial' : 'fulfilled';
                else status = withFiles > 0 ? 'partial' : 'searching';
              }
            }
          } else {
            status = s
              ? s.episodeFileCount > 0
                ? s.episodeFileCount >= s.episodeCount && s.episodeCount > 0
                  ? 'available'
                  : 'partial'
                : 'searching'
              : 'removed';
          }
        }
      }

      return {
        ...row,
        status,
        percent,
        detailHref: row.tmdbId ? (row.mediaType === 'tv' ? `/tv/${row.tmdbId}` : `/documentary/${row.tmdbId}`) : null,
      };
    })
  );

  return NextResponse.json({ requests });
}
