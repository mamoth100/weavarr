export interface GenreDef {
  id: string;
  label: string;
  /** TMDb movie genre id (or "id|id" for an OR match). Omit if this genre has no movie equivalent. */
  movieGenreId?: number | string;
  /** TMDb TV genre id (or "id|id" for an OR match). Omit if this genre has no TV equivalent. */
  tvGenreId?: number | string;
}

/** Sentinel genre id meaning "no genre filter" — matched specially in discoverMovies/discoverTv. */
export const ALL_GENRES_ID = 'all';

/**
 * Sentinel genre id for the sectioned Discover home (trending/popular/coming
 * soon stacks). It lives in the genre catalog so the Menu settings list
 * controls it like any genre - drag it to the top and it becomes the
 * dashboard's default landing, same rule as everything else.
 */
export const DISCOVER_ID = 'discover';

export const GENRE_CATALOG: GenreDef[] = [
  { id: DISCOVER_ID, label: 'Discover' },
  { id: ALL_GENRES_ID, label: 'All Genres', movieGenreId: ALL_GENRES_ID, tvGenreId: ALL_GENRES_ID },
  { id: 'documentary', label: 'Documentaries', movieGenreId: 99, tvGenreId: 99 },
  { id: 'reality', label: 'Reality TV', tvGenreId: 10764 },
  { id: 'action-adventure', label: 'Action & Adventure', movieGenreId: '28|12', tvGenreId: 10759 },
  { id: 'animation', label: 'Animation', movieGenreId: 16, tvGenreId: 16 },
  { id: 'comedy', label: 'Comedy', movieGenreId: 35, tvGenreId: 35 },
  { id: 'crime', label: 'Crime', movieGenreId: 80, tvGenreId: 80 },
  { id: 'drama', label: 'Drama', movieGenreId: 18, tvGenreId: 18 },
  { id: 'family', label: 'Family', movieGenreId: 10751, tvGenreId: 10751 },
  { id: 'fantasy-scifi', label: 'Sci-Fi & Fantasy', movieGenreId: '878|14', tvGenreId: 10765 },
  { id: 'history', label: 'History', movieGenreId: 36 },
  { id: 'horror', label: 'Horror', movieGenreId: 27 },
  { id: 'music', label: 'Music', movieGenreId: 10402 },
  { id: 'mystery', label: 'Mystery', movieGenreId: 9648, tvGenreId: 9648 },
  { id: 'romance', label: 'Romance', movieGenreId: 10749 },
  { id: 'thriller', label: 'Thriller', movieGenreId: 53 },
  { id: 'war-politics', label: 'War & Politics', movieGenreId: 10752, tvGenreId: 10768 },
  { id: 'western', label: 'Western', movieGenreId: 37, tvGenreId: 37 },
  { id: 'kids', label: 'Kids', tvGenreId: 10762 },
  { id: 'news', label: 'News', tvGenreId: 10763 },
  { id: 'soap', label: 'Soap', tvGenreId: 10766 },
  { id: 'talk', label: 'Talk', tvGenreId: 10767 },
  { id: 'tv-movie', label: 'TV Movie', movieGenreId: 10770 },
];

// Discover first so a fresh install lands on the trending/popular home rather
// than on Documentaries (Weavarr's original niche). The first entry is the
// dashboard's default landing; Menu settings can reorder it.
export const DEFAULT_GENRE_IDS = ['discover', 'documentary', 'reality'];

export const ALL_GENRE: GenreDef = GENRE_CATALOG.find((g) => g.id === ALL_GENRES_ID)!;

export function getGenre(id: string | undefined, fallback: GenreDef = ALL_GENRE): GenreDef {
  return GENRE_CATALOG.find((g) => g.id === id) ?? fallback;
}

/**
 * The catalog genre a TMDB genre id belongs to, for the given media type -
 * lets detail-page genre chips link into the browse grid. Handles the
 * "28|12" OR-string ids. Null when no catalog genre covers it (chip renders
 * as plain text instead of a link).
 */
export function catalogGenreForTmdbId(tmdbGenreId: number, mediaType: 'movie' | 'tv'): GenreDef | null {
  for (const genre of GENRE_CATALOG) {
    if (genre.id === ALL_GENRES_ID) continue;
    const field = mediaType === 'movie' ? genre.movieGenreId : genre.tvGenreId;
    if (field === undefined) continue;
    const ids = String(field).split('|').map(Number);
    if (ids.includes(tmdbGenreId)) return genre;
  }
  return null;
}
