import { NextResponse } from 'next/server';
import { getRequestRows } from '@/lib/requestLedger';
import { getAllRadarrMovies } from '@/lib/radarr';
import { getAllSonarrSeries } from '@/lib/sonarr';
import { getDownloadProgress } from '@/lib/downloadProgress';

export const dynamic = 'force-dynamic';

/**
 * The ledger rows plus a LIVE status join - nothing about the present is
 * stored, so nothing can drift: downloading comes from the queues, available
 * from the arr libraries, removed from absence. A failed library listing
 * degrades those rows to "unknown" rather than lying with "removed".
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

  const requests = getRequestRows().map((row) => {
    let status: 'downloading' | 'importing' | 'searching' | 'available' | 'partial' | 'removed' | 'unknown';
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
        status = m ? (m.hasFile ? 'available' : 'searching') : 'removed';
      }
    } else {
      if (!sonarrOk) status = 'unknown';
      else {
        const s = (row.tmdbId ? showByTmdb.get(row.tmdbId) : undefined) ?? (row.tvdbId ? showByTvdb.get(row.tvdbId) : undefined);
        status = s
          ? s.episodeFileCount > 0
            ? s.episodeFileCount >= s.episodeCount && s.episodeCount > 0
              ? 'available'
              : 'partial'
            : 'searching'
          : 'removed';
      }
    }

    return {
      ...row,
      status,
      percent,
      detailHref: row.tmdbId ? (row.mediaType === 'tv' ? `/tv/${row.tmdbId}` : `/documentary/${row.tmdbId}`) : null,
    };
  });

  return NextResponse.json({ requests });
}
