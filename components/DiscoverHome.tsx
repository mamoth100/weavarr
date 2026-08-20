import Link from 'next/link';
import CardGrid from '@/components/CardGrid';
import {
  discoverMovies,
  discoverTv,
  discoverUpcoming,
  discoverUpcomingTv,
  getPopularMovies,
  getPopularTv,
  getTrendingWeek,
} from '@/lib/tmdb';
import { getRawEnvValue } from '@/lib/settings';
import { getGenre } from '@/lib/genreCatalog';
import { parseDiscoverSections, sectionHref, sectionLabel, specId, type DiscoverSectionSpec } from '@/lib/discoverSections';
import type { TmdbMovie } from '@/types';

/** Cards per section - two rows on a five-column desktop grid. CardGrid gets the full fetch and caps AFTER watched/owned filtering so hidden items top up instead of leaving holes. */
const SLICE = 10;

/** Interleave two ranked lists so neither medium buries the other. */
function interleave(a: TmdbMovie[], b: TmdbMovie[]): TmdbMovie[] {
  const out: TmdbMovie[] = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

/**
 * One section's items. Unscoped rows use TMDB's real curated endpoints;
 * genre-scoped trending/popular rows use discover sorted by popularity -
 * TMDB's trending endpoint can't filter by genre, and popularity-now is the
 * same signal. Coming-soon rows reuse the upcoming fetchers, which take a
 * genre natively.
 */
async function fetchSection(spec: DiscoverSectionSpec): Promise<TmdbMovie[]> {
  const wantMovies = spec.type !== 'tv';
  const wantTv = spec.type !== 'movie';

  if (spec.kind === 'upcoming') {
    const g = spec.genreId === 'all' ? null : getGenre(spec.genreId);
    const [movies, tv] = await Promise.all([
      wantMovies && (!g || g.movieGenreId) ? discoverUpcoming({ genre: g?.movieGenreId ?? 'all' }) : Promise.resolve(null),
      wantTv && (!g || g.tvGenreId) ? discoverUpcomingTv({ genre: g?.tvGenreId ?? 'all' }) : Promise.resolve(null),
    ]);
    return [...(movies?.results ?? []), ...(tv?.results ?? [])].sort(
      (a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? '')
    );
  }

  if (spec.genreId === 'all') {
    if (spec.kind === 'trending') {
      return (await getTrendingWeek(1, spec.type)).results;
    }
    const [movies, tv] = await Promise.all([
      wantMovies ? getPopularMovies() : Promise.resolve(null),
      wantTv ? getPopularTv() : Promise.resolve(null),
    ]);
    if (movies && tv) return interleave(movies.results, tv.results);
    return movies?.results ?? tv?.results ?? [];
  }

  // Genre-scoped trending/popular.
  const g = getGenre(spec.genreId);
  const [movies, tv] = await Promise.all([
    wantMovies && g.movieGenreId
      ? discoverMovies({ sortBy: 'popularity.desc', genre: g.movieGenreId }).catch(() => null)
      : Promise.resolve(null),
    wantTv && g.tvGenreId
      ? discoverTv({ sortBy: 'popularity.desc', genre: g.tvGenreId }).catch(() => null)
      : Promise.resolve(null),
  ]);
  const tvTagged = tv?.results ?? [];
  const movieResults = movies?.results ?? [];
  if (movieResults.length && tvTagged.length) {
    return [...movieResults, ...tvTagged].sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
  }
  return movieResults.length ? movieResults : tvTagged;
}

/**
 * The sectioned Discover landing: stacked vertical slices, user-composed in
 * Settings > Menu > Discover sections (kind + media type + optional genre,
 * reorderable). Deliberately no carousels - nothing here scrolls sideways.
 * A section whose fetch fails is dropped rather than taking the whole
 * landing page down; if everything failed, say so once.
 */
export default async function DiscoverHome() {
  const specs = parseDiscoverSections(await getRawEnvValue('DISCOVER_SECTIONS'));

  if (specs.length === 0) {
    return (
      <div className="text-center text-zinc-500 py-24">
        Discover has no sections. Add some under Settings → Menu → Discover sections.
      </div>
    );
  }

  const settled = await Promise.allSettled(specs.map((s) => fetchSection(s)));
  const sections = specs.map((spec, i) => ({
    spec,
    items: settled[i].status === 'fulfilled' ? (settled[i] as PromiseFulfilledResult<TmdbMovie[]>).value : null,
  }));

  if (sections.every((s) => !s.items || s.items.length === 0)) {
    return (
      <div className="text-center text-zinc-500 py-24">
        Couldn&apos;t reach TMDB for the Discover lists - try a reload.
      </div>
    );
  }

  return (
    <div className="space-y-10">
      {sections.map(({ spec, items }) =>
        !items || items.length === 0 ? null : (
          <section key={specId(spec)}>
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-lg font-semibold text-white">{sectionLabel(spec)}</h2>
              <Link
                href={sectionHref(spec)}
                className="text-sm font-medium text-amber-400 hover:text-amber-300 whitespace-nowrap"
              >
                See all →
              </Link>
            </div>
            <CardGrid
              items={items}
              mediaType={spec.type === 'tv' ? 'tv' : 'movie'}
              variant={spec.kind === 'upcoming' ? 'upcoming' : 'default'}
              quiet
              maxItems={SLICE}
            />
          </section>
        )
      )}
    </div>
  );
}
