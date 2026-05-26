export interface TmdbMovie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids?: number[];
  genres?: { id: number; name: string }[];
  popularity: number;
}

export interface TmdbKeyword {
  id: number;
  name: string;
}

export interface TmdbDetailResponse extends TmdbMovie {
  genres: { id: number; name: string }[];
  keywords: { keywords: TmdbKeyword[] };
  external_ids: { imdb_id: string | null };
  runtime: number | null;
  tagline: string;
}

export interface TmdbDiscoverResponse {
  page: number;
  results: TmdbMovie[];
  total_pages: number;
  total_results: number;
}

export interface OmdbResponse {
  Title: string;
  Year: string;
  Rated: string;
  imdbRating: string;
  imdbVotes: string;
  Ratings: { Source: string; Value: string }[];
  Director: string;
  Actors: string;
  Awards: string;
  Plot: string;
  Response: string;
}

export interface CompositeScore {
  score: number;
  tmdbScore: number;
  imdbScore: number | null;
  rtScore: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface Subgenre {
  id: string;
  label: string;
  emoji: string;
  // Keyword IDs from TMDb — verify/update at: https://www.themoviedb.org/keyword
  keywordIds: number[];
}

export type SortOption =
  | 'vote_average.desc'
  | 'release_date.desc'
  | 'release_date.asc'
  | 'popularity.desc'
  | 'vote_count.desc';
