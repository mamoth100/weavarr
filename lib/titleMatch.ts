/** Strips the trailing parenthesized disambiguator Sonarr/Radarr append to titles ("(US)", "(2020)"). */
export function stripDisambiguator(title: string): string {
  return title.replace(/\s*\([^)]*\)\s*$/, '').trim();
}

/**
 * Strict title equality after normalization: lowercase, trailing
 * disambiguator stripped from BOTH sides, whitespace collapsed.
 *
 * Deliberately NOT substring containment. The old bidirectional
 * `a.includes(b) || b.includes(a)` matcher (previously copy-pasted into
 * plex.ts, jellyfin.ts, readyToWatch.ts, and cleanupCandidates.ts) fed
 * destructive actions with whatever library item happened to sort first:
 * a watch signal for "Doctor Who" matched "Doctor Who Confidential",
 * "Alien" matched "Aliens", and the mismatched id flowed straight into
 * episode/movie deletes and Plex scrobbles. Equality-after-normalization
 * keeps the legitimate cases those call sites needed ("Show (US)" vs
 * "Show", year suffixes) without letting one title act on another.
 */
export function titlesMatch(a: string, b: string): boolean {
  const na = stripDisambiguator(a).toLowerCase().replace(/\s+/g, ' ').trim();
  const nb = stripDisambiguator(b).toLowerCase().replace(/\s+/g, ' ').trim();
  return na !== '' && na === nb;
}
