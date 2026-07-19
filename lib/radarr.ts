const RADARR_URL = process.env.RADARR_URL;
const RADARR_KEY = process.env.RADARR_KEY;

function headers() {
  return { 'X-Api-Key': RADARR_KEY as string, 'Content-Type': 'application/json' };
}

export async function addMovieToRadarr(tmdbId: number) {
  if (!RADARR_URL || !RADARR_KEY) throw new Error('Radarr is not configured');

  const lookupRes = await fetch(`${RADARR_URL}/api/v3/movie/lookup/tmdb?tmdbId=${tmdbId}`, {
    headers: headers(),
    cache: 'no-store',
  });
  if (!lookupRes.ok) throw new Error(`Radarr lookup failed: ${lookupRes.status}`);
  const movie = await lookupRes.json();

  if (movie.id) return { alreadyAdded: true };

  const [profilesRes, foldersRes] = await Promise.all([
    fetch(`${RADARR_URL}/api/v3/qualityprofile`, { headers: headers(), cache: 'no-store' }),
    fetch(`${RADARR_URL}/api/v3/rootfolder`, { headers: headers(), cache: 'no-store' }),
  ]);
  const profiles = await profilesRes.json();
  const folders = await foldersRes.json();
  if (!profiles?.length) throw new Error('Radarr has no quality profile configured');
  if (!folders?.length) throw new Error('Radarr has no root folder configured');

  const addRes = await fetch(`${RADARR_URL}/api/v3/movie`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      ...movie,
      qualityProfileId: profiles[0].id,
      rootFolderPath: folders[0].path,
      monitored: true,
      addOptions: { searchForMovie: true },
    }),
  });
  if (!addRes.ok) throw new Error(`Radarr add failed: ${await addRes.text()}`);
  return { alreadyAdded: false };
}
