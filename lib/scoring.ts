import type { CompositeScore, OmdbResponse } from '@/types';

export function computeCompositeScore(
  tmdbRating: number,
  tmdbVotes: number,
  omdb: OmdbResponse | null
): CompositeScore {
  const rtScore =
    omdb?.Ratings?.find((r) => r.Source === 'Rotten Tomatoes')?.Value ?? null;

  const imdbRating =
    omdb?.imdbRating && omdb.imdbRating !== 'N/A'
      ? parseFloat(omdb.imdbRating)
      : null;

  const imdbVotes =
    omdb?.imdbVotes && omdb.imdbVotes !== 'N/A'
      ? parseInt(omdb.imdbVotes.replace(/,/g, ''), 10)
      : null;

  // If no IMDb data, fall back to TMDb score alone
  if (imdbRating === null || imdbVotes === null) {
    const confidence =
      tmdbVotes > 1000 ? 'high' : tmdbVotes > 100 ? 'medium' : 'low';
    return {
      score: Math.round(tmdbRating * 10) / 10,
      tmdbScore: tmdbRating,
      imdbScore: null,
      rtScore,
      confidence,
    };
  }

  // Weighted average by vote count
  const totalVotes = tmdbVotes + imdbVotes;
  const weighted =
    (tmdbRating * tmdbVotes + imdbRating * imdbVotes) / totalVotes;

  return {
    score: Math.round(weighted * 10) / 10,
    tmdbScore: tmdbRating,
    imdbScore: imdbRating,
    rtScore,
    confidence:
      totalVotes > 10000 ? 'high' : totalVotes > 1000 ? 'medium' : 'low',
  };
}
