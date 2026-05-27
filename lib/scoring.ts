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

  // Weighted average across all available sources
  let weightedSum = 0;
  let totalWeight = 0;

  if (tmdbRating > 0 && tmdbVotes > 0) {
    weightedSum += tmdbRating * tmdbVotes;
    totalWeight += tmdbVotes;
  }
  if (imdbRating !== null && imdbVotes !== null) {
    weightedSum += imdbRating * imdbVotes;
    totalWeight += imdbVotes;
  }
  if (traktScore !== null && traktVotes !== null) {
    weightedSum += traktScore * traktVotes;
    totalWeight += traktVotes;
  }

  const score = totalWeight > 0 ? weightedSum / totalWeight : tmdbRating;

  return {
    score: Math.round(score * 10) / 10,
    tmdbScore: tmdbRating,
    imdbScore: imdbRating,
    traktScore,
    rtScore,
    metacriticScore,
    confidence:
      totalWeight > 10000 ? 'high' : totalWeight > 1000 ? 'medium' : 'low',
  };
}
