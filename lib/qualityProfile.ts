interface QualityProfile {
  id: number;
  name: string;
}

/**
 * "Any - Copy" grabs the highest quality release available even when other
 * profiles would filter it out — matches Radarr/Sonarr naming convention for
 * a duplicated-and-loosened default profile.
 */
export function pickQualityProfile(profiles: QualityProfile[], highestQuality: boolean): QualityProfile {
  const preferred = highestQuality ? 'Any - Copy' : 'HD - 720p/1080p';
  const match = profiles.find((p) => p.name.toLowerCase() === preferred.toLowerCase());
  return match ?? profiles[0];
}
