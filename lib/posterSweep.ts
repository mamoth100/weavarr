/**
 * Background chore: prune cached posters for titles deleted directly in
 * Radarr/Sonarr. Weavarr's own delete buttons clean their poster on the way
 * out, but external deletes bypass that - at "a billion movies" scale the
 * orphans would pile up forever.
 */
import { getAllRadarrMovies } from './radarr';
import { getAllSonarrSeries } from './sonarr';
import { prunePosterCache } from './posterCache';

export async function sweepOrphanedPosters(): Promise<void> {
  // Per-service and fail-closed: a service whose id listing can't be fetched
  // (down, misconfigured, disabled) is skipped entirely this round rather
  // than having "couldn't ask" treated as "everything's an orphan".
  const results = await Promise.allSettled([
    getAllRadarrMovies().then((movies) => prunePosterCache('radarr', new Set(movies.map((m) => m.id)))),
    getAllSonarrSeries().then((series) => prunePosterCache('sonarr', new Set(series.map((s) => s.id)))),
  ]);

  const removed = results.reduce((sum, r) => sum + (r.status === 'fulfilled' ? r.value : 0), 0);
  if (removed > 0) {
    console.log(`[posterSweep] removed ${removed} cached poster${removed === 1 ? '' : 's'} for titles no longer in Radarr/Sonarr`);
  }
}
