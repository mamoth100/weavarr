interface QualityProfile {
  id: number;
  name: string;
}

/**
 * Matches the configured profile name (from Settings, or a per-request
 * override) against what this Radarr/Sonarr instance actually has. Falls
 * back to whatever profile is first when nothing is configured yet, rather
 * than guessing a profile name that may not exist in this instance.
 */
export function pickQualityProfile(profiles: QualityProfile[], configuredName?: string | null): QualityProfile {
  const preferred = configuredName?.trim();
  const match = preferred ? profiles.find((p) => p.name.toLowerCase() === preferred.toLowerCase()) : undefined;
  return match ?? profiles[0];
}
