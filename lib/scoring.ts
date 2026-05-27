import type { CompositeScore, OmdbResponse } from '@/types';
import type { TraktRatings } from '@/lib/trakt';

// Bayesian prior for documentary genre
const PRIOR_MEAN = 7.0;   // mean rating across all documentaries
const PRIOR_STRENGTH = 1000; // vote count at which we trust 50% rating, 50% prior

function bayesian(rating: number, votes: number): number {
  return (votes / (votes + PRIOR_STRENGTH)) * rating +
         (PRIOR_STRENGTH / (votes + PRIOR_STRENGTH)) * PRIOR_MEAN;
}

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

  let score: number;
  let confidence: CompositeScore['confidence'];

  if (imdbRating !== null && imdbVotes !== null && imdbVotes > 0) {
    // IMDb is primary: apply Bayesian correction then blend with TMDb/Trakt at capped weight
    const bayesImdb = bayesian(imdbRating, imdbVotes);

    // Cap supplementary sources so they nudge, not override
    const imdbWeight = Math.min(imdbVotes, 10000);
    const tmdbWeight = tmdbRating > 0 ? Math.min(tmdbVotes, 300) : 0;
    const traktWeight = traktScore !== null && traktVotes !== null ? Math.min(traktVotes, 300) : 0;

    const totalWeight = imdbWeight + tmdbWeight + traktWeight;
    const weightedSum =
      bayesImdb * imdbWeight +
      (tmdbRating > 0 ? tmdbRating * tmdbWeight : 0) +
      (traktScore !== null ? traktScore * traktWeight : 0);

    score = weightedSum / totalWeight;
    confidence = imdbVotes >= 5000 ? 'high' : imdbVotes >= 500 ? 'medium' : 'low';
  } else {
    // No IMDb — fall back to Bayesian TMDb
    score = bayesian(tmdbRating, tmdbVotes);
    confidence = tmdbVotes >= 500 ? 'medium' : 'low';
  }

  return {
    score: Math.round(score * 10) / 10,
    tmdbScore: tmdbRating,
    imdbScore: imdbRating,
    traktScore,
    rtScore,
    metacriticScore,
    confidence,
  };
}
