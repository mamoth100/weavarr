import { GENRE_CATALOG, ALL_GENRES_ID, DISCOVER_ID, getGenre } from './genreCatalog';

/**
 * The Discover home's sections, user-composed in Settings > Menu. A spec is
 * kind.type.genre ("trending.all.all", "popular.movie.documentary"), stored
 * as an ordered comma list in DISCOVER_SECTIONS - the same shape as
 * MENU_GENRES/MENU_LINKS. Null (never saved) means the default four; an
 * explicit empty string means the user deliberately chose zero.
 */

export type SectionKind = 'trending' | 'popular' | 'upcoming';
export type SectionType = 'all' | 'movie' | 'tv';

export interface DiscoverSectionSpec {
  kind: SectionKind;
  type: SectionType;
  /** A GENRE_CATALOG id, or 'all' for unscoped. */
  genreId: string;
}

export const SECTION_KINDS: { value: SectionKind; label: string }[] = [
  { value: 'trending', label: 'Trending this week' },
  { value: 'popular', label: 'Popular' },
  { value: 'upcoming', label: 'Coming soon' },
];

export const SECTION_TYPES: { value: SectionType; label: string }[] = [
  { value: 'all', label: 'Movies & TV' },
  { value: 'movie', label: 'Movies' },
  { value: 'tv', label: 'TV' },
];

export const DEFAULT_DISCOVER_SPECS: DiscoverSectionSpec[] = [
  { kind: 'trending', type: 'all', genreId: 'all' },
  { kind: 'popular', type: 'movie', genreId: 'all' },
  { kind: 'popular', type: 'tv', genreId: 'all' },
  { kind: 'upcoming', type: 'all', genreId: 'all' },
];

export function specId(s: DiscoverSectionSpec): string {
  return `${s.kind}.${s.type}.${s.genreId}`;
}

const KINDS = new Set<string>(SECTION_KINDS.map((k) => k.value));
const TYPES = new Set<string>(SECTION_TYPES.map((t) => t.value));

export function parseSpec(id: string): DiscoverSectionSpec | null {
  const [kind, type, ...genreParts] = id.trim().split('.');
  const genreId = genreParts.join('.');
  if (!KINDS.has(kind) || !TYPES.has(type)) return null;
  if (genreId !== 'all' && !GENRE_CATALOG.some((g) => g.id === genreId && g.id !== DISCOVER_ID)) return null;
  return { kind: kind as SectionKind, type: type as SectionType, genreId };
}

export function parseDiscoverSections(value: string | null | undefined): DiscoverSectionSpec[] {
  if (value === null || value === undefined) return DEFAULT_DISCOVER_SPECS;
  if (value.trim() === '') return [];
  return value
    .split(',')
    .map((id) => parseSpec(id))
    .filter((s): s is DiscoverSectionSpec => s !== null);
}

/** Human name for a section, composed the way a person would say it: "Trending Documentaries (movies)", "Comedy coming soon". */
export function sectionLabel(s: DiscoverSectionSpec): string {
  const genre = s.genreId !== 'all' && s.genreId !== ALL_GENRES_ID ? getGenre(s.genreId).label : null;
  const typeSuffix = genre && s.type !== 'all' ? (s.type === 'movie' ? ' (movies)' : ' (shows)') : '';
  if (s.kind === 'upcoming') {
    if (genre) return `${genre} coming soon${typeSuffix}`;
    return s.type === 'movie' ? 'Movies coming soon' : s.type === 'tv' ? 'Shows coming soon' : 'Coming soon';
  }
  const base = s.kind === 'trending' ? 'Trending' : 'Popular';
  if (genre) return `${base} ${genre}${typeSuffix}`;
  if (s.type === 'movie') return `${base} movies`;
  if (s.type === 'tv') return `${base} shows`;
  return s.kind === 'trending' ? 'Trending this week' : 'Popular now';
}

/** Where "See all" lands: the special browse views for unscoped rows, the normal genre grid (popularity-sorted) or the Coming Soon tab for scoped ones. */
export function sectionHref(s: DiscoverSectionSpec): string {
  if (s.kind === 'upcoming') {
    return s.genreId !== 'all' ? `/?genre=upcoming&upcomingGenre=${s.genreId}` : '/?genre=upcoming';
  }
  if (s.genreId !== 'all') return `/?genre=${s.genreId}&sort=popularity.desc`;
  if (s.kind === 'trending') return '/?genre=trending';
  return s.type === 'tv' ? '/?genre=popular-tv' : s.type === 'movie' ? '/?genre=popular-movies' : '/?genre=popular';
}
