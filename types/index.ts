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
  original_language?: string;
  spoken_language?: string; // enriched server-side from detail endpoint
  mediaType?: 'movie' | 'tv';
}

export interface TmdbKeyword {
  id: number;
  name: string;
}

export interface TmdbVideo {
  key: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

export interface TmdbSeason {
  season_number: number;
  name: string;
  episode_count: number;
  /** First-episode air date; optional because older callers pass seasons without it. */
  air_date?: string | null;
}

/** One cast or crew entry on a title. */
export interface TmdbCredit {
  id: number;
  name: string;
  profile_path: string | null;
  character?: string;
  job?: string;
  department?: string;
  order?: number;
}

/** A person page: bio plus every title they were part of, as cards. */
export interface TmdbPerson {
  id: number;
  name: string;
  biography: string;
  profile_path: string | null;
  known_for_department: string | null;
  birthday: string | null;
  deathday: string | null;
  place_of_birth: string | null;
  knownFor: TmdbMovie[];
  movies: TmdbMovie[];
  shows: TmdbMovie[];
}

export interface TmdbDetailResponse extends TmdbMovie {
  credits?: { cast: TmdbCredit[]; crew: TmdbCredit[] };
  created_by?: { id: number; name: string; profile_path: string | null }[];
  genres: { id: number; name: string }[];
  keywords: { keywords: TmdbKeyword[] };
  external_ids: { imdb_id: string | null };
  runtime: number | null;
  tagline: string;
  videos?: { results: TmdbVideo[] };
  recommendations?: { results: TmdbMovie[] };
  status?: string;
  spoken_languages?: { iso_639_1: string; english_name: string }[];
  seasons?: TmdbSeason[];
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
  traktScore: number | null;
  rtScore: string | null;
  metacriticScore: string | null;
  confidence: 'high' | 'medium' | 'low';
}

export interface WatchProvider {
  provider_id: number;
  provider_name: string;
  logo_path: string;
}

export interface WatchProviders {
  flatrate?: WatchProvider[];
  rent?: WatchProvider[];
  buy?: WatchProvider[];
  link?: string;
}

export interface Subgenre {
  id: string;
  label: string;
  // Keyword IDs from TMDb — verify/update at: https://www.themoviedb.org/keyword
  keywordIds: number[];
}

export type MediaType = 'movie' | 'tv';

export type SortOption =
  | 'vote_average.desc'
  | 'release_date.desc'
  | 'release_date.asc'
  | 'popularity.desc'
  | 'vote_count.desc';
