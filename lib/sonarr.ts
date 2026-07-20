import { pickQualityProfile } from './qualityProfile';

const SONARR_URL = process.env.SONARR_URL;
const SONARR_KEY = process.env.SONARR_KEY;

function headers() {
  return { 'X-Api-Key': SONARR_KEY as string, 'Content-Type': 'application/json' };
}

export async function addSeriesToSonarr({
  imdbId,
  title,
  monitor = 'all',
  seasonNumber,
  highestQuality = false,
}: {
  imdbId: string | null;
  title: string;
  monitor?: string;
  seasonNumber?: number;
  highestQuality?: boolean;
}) {
  if (!SONARR_URL || !SONARR_KEY) throw new Error('Sonarr is not configured');

  const term = imdbId ? `imdb:${imdbId}` : title;
  const lookupRes = await fetch(`${SONARR_URL}/api/v3/series/lookup?term=${encodeURIComponent(term)}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!lookupRes.ok) throw new Error(`Sonarr lookup failed: ${lookupRes.status}`);
  const results = await lookupRes.json();
  const series = results[0];
  if (!series) throw new Error('No matching series found in Sonarr');

  if (series.id) return { alreadyAdded: true };

  const [profilesRes, foldersRes] = await Promise.all([
    fetch(`${SONARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' }),
    fetch(`${SONARR_URL}/api/v3/rootfolder`, { headers: headers(), cache: 'no-store' }),
  ]);
  const profiles = await profilesRes.json();
  const folders = await foldersRes.json();
  if (!profiles?.length) throw new Error('Sonarr has no quality profile configured');
  if (!folders?.length) throw new Error('Sonarr has no root folder configured');

  const profile = pickQualityProfile(profiles, highestQuality);

  // A specific season number wins over the preset monitor strategy: hand-pick
  // which season is monitored and leave addOptions.monitor out so Sonarr
  // doesn't overwrite that per-season choice.
  const seasons = seasonNumber !== undefined
    ? (series.seasons as { seasonNumber: number }[]).map((s) => ({ ...s, monitored: s.seasonNumber === seasonNumber }))
    : series.seasons;

  const addRes = await fetch(`${SONARR_URL}/api/v3/series`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      ...series,
      seasons,
      qualityProfileId: profile.id,
      rootFolderPath: folders[0].path,
      monitored: true,
      addOptions: seasonNumber !== undefined
        ? { searchForMissingEpisodes: true }
        : { monitor, searchForMissingEpisodes: monitor !== 'future' },
    }),
  });
  if (!addRes.ok) throw new Error(`Sonarr add failed: ${await addRes.text()}`);
  return { alreadyAdded: false };
}
