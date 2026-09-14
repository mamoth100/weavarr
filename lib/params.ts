/**
 * Strict integer parsing for API route inputs. A body value that is not a
 * whole number in range is rejected up front instead of being coerced
 * differently at each use site: the delete routes used to check
 * `Number(seriesId)` for protection but pass the raw value to the delete,
 * so a crafted string could pass the check as NaN and still reach Sonarr.
 */
export function parsePositiveInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Same, but zero allowed (season 0 is Specials). */
export function parseNonNegativeInt(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
  return Number.isInteger(n) && n >= 0 ? n : null;
}
