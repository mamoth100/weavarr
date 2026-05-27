import type { CompositeScore, OmdbResponse } from '@/types';
import type { TraktRatings } from '@/lib/trakt';

export function computeCompositeScore(
  tmdbRating: number,
  tmdbVotes: number,
  omdb: OmdbResponse | null,
  trakt: TraktRatings | null = null
): CompositeScore {
  const rtScore =
    omdb?.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value ?? null;
  const metacriticScore =
    omdb?.Ratings?.find((r) => r.Source === 'Metacritic')?.Value ?? null;

  const imdbRating =
    omdb?.imdbRating && omdb.imdbRating !== 'N/A'
      ? parseFloat(omdb.imdbRating)
      : null;
  const imdbVotes =
    omdb?.imdbVotes && omdb.imdbVotes !== 'N/A'
      ? parseInt(omdb.imdbVotes.replace(/,/g, ''), 10)
      : null;

  const traktScore = trakt?.rating ?? null;
  const traktVotes = trakt?.votes ?? null;

  // Equal-weight average across available sources so no single platform dominates
  const sources: number[] = [];

  if (tmdbRating > 0 && tmdbVotes > 0) sources.push(tmdbRating);
  if (imdbRating !== null) sources.push(imdbRating);
  if (traktScore !== null) sources.push(traktScore);

  const score =
    sources.length > 0
      ? sources.reduce((a, b) => a + b, 0) / sources.length
      : tmdbRating;

  return {
    score: Math.round(score * 10) / 10,
    tmdbScore: tmdbRating,
    imdbScore: imdbRating,
    traktScore,
    rtScore,
    metacriticScore,
    confidence:
      sources.length >= 3 ? 'high' : sources.length === 2 ? 'medium' : 'low',
  };
}
