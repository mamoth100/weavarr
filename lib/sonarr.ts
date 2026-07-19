const SONARR_URL = process.env.SONARR_URL;
const SONARR_KEY = process.env.SONARR_KEY;

function headers() {
  return { 'X-Api-Key': SONARR_KEY as string, 'Content-Type': 'application/json' };
}

export async function addSeriesToSonarr({ imdbId, title }: { imdbId: string | null; title: string }) {
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

  const addRes = await fetch(`${SONARR_URL}/api/v3/series`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      ...series,
      qualityProfileId: profiles[0].id,
      rootFolderPath: folders[0].path,
      monitored: true,
      addOptions: { searchForMissingEpisodes: true },
    }),
  });
  if (!addRes.ok) throw new Error(`Sonarr add failed: ${await addRes.text()}`);
  return { alreadyAdded: false };
}
