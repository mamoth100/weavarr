export interface GenreDef {
  id: string;
  label: string;
  /** TMDb movie genre id (or "id|id" for an OR match). Omit if this genre has no movie equivalent. */
  movieGenreId?: number | string;
  /** TMDb TV genre id (or "id|id" for an OR match). Omit if this genre has no TV equivalent. */
  tvGenreId?: number | string;
}

export const GENRE_CATALOG: GenreDef[] = [
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

export const DEFAULT_GENRE_IDS = ['documentary', 'reality'];

export function getGenre(id: string | undefined, fallback: GenreDef = GENRE_CATALOG[0]): GenreDef {
  return GENRE_CATALOG.find((g) => g.id === id) ?? fallback;
}
