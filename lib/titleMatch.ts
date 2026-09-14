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
  const norm = (t: string) => t.toLowerCase().replace(/\s+/g, ' ').trim();
  const aHas = hasDisambiguator(a);
  const bHas = hasDisambiguator(b);
  // Both sides carry a disambiguator: they must agree in full. Stripping
  // both made "The Office (US)" equal "The Office (UK)" and "Battlestar
  // Galactica (1978)" equal "Battlestar Galactica (2003)", and the cleanup
  // path took the first hit, so a watch on one could delete the other.
  if (aHas && bHas) {
    const na = norm(a);
    return na !== '' && na === norm(b);
  }
  const na = norm(stripDisambiguator(a));
  const nb = norm(stripDisambiguator(b));
  return na !== '' && na === nb;
}

function hasDisambiguator(title: string): boolean {
  return /\s*\([^)]*\)\s*$/.test(title);
}

/**
 * The single item whose title matches, or null when none or more than one
 * does. Anything that deletes must use this rather than `.find`: with two
 * same-named entries (a show and its remake, both stored without a
 * disambiguator), `.find` silently picks whichever sorts first.
 */
export function findUniqueByTitle<T>(items: T[], title: string, getTitle: (item: T) => string): T | null {
  const hits = items.filter((item) => titlesMatch(getTitle(item), title));
  return hits.length === 1 ? hits[0] : null;
}
