interface QualityProfile {
  id: number;
  name: string;
}

/**
 * "Any" has no upper cutoff, so it grabs the highest quality release
 * available even when a narrower profile would filter it out.
 */
export function pickQualityProfile(profiles: QualityProfile[], highestQuality: boolean): QualityProfile {
  const preferred = highestQuality ? 'Any' : 'HD - 720p/1080p';
  const match = profiles.find((p) => p.name.toLowerCase() === preferred.toLowerCase());
  return match ?? profiles[0];
}
