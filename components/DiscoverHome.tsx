import Link from 'next/link';
import CardGrid from '@/components/CardGrid';
import { discoverUpcoming, discoverUpcomingTv, getPopularMovies, getPopularTv, getTrendingWeek } from '@/lib/tmdb';
import type { TmdbMovie } from '@/types';

/** Cards per section - two rows on a five-column desktop grid. */
const SLICE = 10;

async function fetchComingSoon(): Promise<TmdbMovie[]> {
  // Same merge the Coming Soon tab does (all genres, soonest first).
  const [movies, tv] = await Promise.all([discoverUpcoming({}), discoverUpcomingTv({})]);
  return [...movies.results, ...tv.results].sort(
    (a, b) => (a.release_date ?? '').localeCompare(b.release_date ?? '')
  );
}

interface Section {
  title: string;
  /** The see-all target - each section is page 1 of a full infinite-scroll view. */
  href: string;
  variant: 'default' | 'upcoming';
  fetchItems: () => Promise<TmdbMovie[]>;
}

const SECTIONS: Section[] = [
  { title: 'Trending this week', href: '/?genre=trending', variant: 'default', fetchItems: async () => (await getTrendingWeek()).results },
  { title: 'Popular movies', href: '/?genre=popular-movies', variant: 'default', fetchItems: async () => (await getPopularMovies()).results },
  { title: 'Popular shows', href: '/?genre=popular-tv', variant: 'default', fetchItems: async () => (await getPopularTv()).results },
  { title: 'Coming soon', href: '/?genre=upcoming', variant: 'upcoming', fetchItems: fetchComingSoon },
];

/**
 * The sectioned Discover landing: stacked vertical slices of TMDB's curated
 * lists, each a static one-fetch grid with a "See all" into the full
 * infinite-scroll view. Deliberately no carousels - nothing here scrolls
 * sideways. A section whose fetch fails is dropped rather than taking the
 * whole landing page down; if everything failed, say so once.
 */
export default async function DiscoverHome() {
  const settled = await Promise.allSettled(SECTIONS.map((s) => s.fetchItems()));
  const sections = SECTIONS.map((s, i) => ({
    ...s,
    items: settled[i].status === 'fulfilled' ? (settled[i] as PromiseFulfilledResult<TmdbMovie[]>).value.slice(0, SLICE) : null,
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
      {sections.map((s) =>
        !s.items || s.items.length === 0 ? null : (
          <section key={s.title}>
            <div className="flex items-baseline justify-between mb-1">
              <h2 className="text-lg font-semibold text-white">{s.title}</h2>
              <Link
                href={s.href}
                className="text-sm font-medium text-amber-400 hover:text-amber-300 whitespace-nowrap"
              >
                See all →
              </Link>
            </div>
            <CardGrid items={s.items} mediaType="movie" variant={s.variant} quiet />
          </section>
        )
      )}
    </div>
  );
}
