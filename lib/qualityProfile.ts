interface QualityProfile {
  id: number;
  name: string;
}

/**
 * "Any" has no upper cutoff, so it grabs the highest quality release
 * available even when a narrower profile would filter it out. Falls back to
 * these names when the user hasn't picked profiles in Settings.
 */
export function pickQualityProfile(
  profiles: QualityProfile[],
  highestQuality: boolean,
  configuredName?: string | null
): QualityProfile {
  const fallback = highestQuality ? 'Any' : 'HD - 720p/1080p';
  const preferred = configuredName?.trim() || fallback;
  const match = profiles.find((p) => p.name.toLowerCase() === preferred.toLowerCase());
  return match ?? profiles[0];
}
