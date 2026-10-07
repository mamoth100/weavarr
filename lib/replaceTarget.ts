import { parsePositiveInt, parseNonNegativeInt } from './params';
import type { ReplaceTarget } from './replaceFile';

/** The movie or episode a replace request points at, or null when the body does not describe one. */
export function parseReplaceTarget(body: Record<string, unknown>): ReplaceTarget | null {
  if (body.type === 'movie') {
    const movieId = parsePositiveInt(body.movieId);
    return movieId === null ? null : { type: 'movie', movieId };
  }
  if (body.type === 'tv') {
    const seriesId = parsePositiveInt(body.seriesId);
    const seasonNumber = parseNonNegativeInt(body.seasonNumber);
    const episodeNumber = parsePositiveInt(body.episodeNumber);
    if (seriesId === null || seasonNumber === null || episodeNumber === null) return null;
    return { type: 'tv', seriesId, seasonNumber, episodeNumber };
  }
  return null;
}
