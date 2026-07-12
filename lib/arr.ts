'use client';

const RADARR_URL = process.env.NEXT_PUBLIC_RADARR_URL;
const RADARR_KEY = process.env.NEXT_PUBLIC_RADARR_KEY;
const SONARR_URL = process.env.NEXT_PUBLIC_SONARR_URL;
const SONARR_KEY = process.env.NEXT_PUBLIC_SONARR_KEY;

async function arrFetch(url: string, key: string, path: string, options?: RequestInit) {
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json', ...options?.headers },
  });
  return res;
}

export async function addToRadarr(tmdbId: number): Promise<'added' | 'exists' | 'error'> {
  if (!RADARR_URL || !RADARR_KEY) return 'error';
  try {
    // Look up movie
    const lookupRes = await arrFetch(RADARR_URL, RADARR_KEY, `/api/v3/movie/lookup/tmdb?tmdbId=${tmdbId}`);
    if (!lookupRes.ok) return 'error';
    const movies = await lookupRes.json();
    if (!movies?.length) return 'error';

    // Get quality profile + root folder
    const [profilesRes, foldersRes] = await Promise.all([
      arrFetch(RADARR_URL, RADARR_KEY, '/api/v3/qualityprofile'),
      arrFetch(RADARR_URL, RADARR_KEY, '/api/v3/rootfolder'),
    ]);
    const profiles = await profilesRes.json();
    const folders = await foldersRes.json();
    if (!profiles?.length || !folders?.length) return 'error';

    // Add movie
    const addRes = await arrFetch(RADARR_URL, RADARR_KEY, '/api/v3/movie', {
      method: 'POST',
      body: JSON.stringify({
        ...movies[0],
        qualityProfileId: profiles[0].id,
        rootFolderPath: folders[0].path,
        monitored: true,
        addOptions: { searchForMovie: true },
      }),
    });

    if (addRes.status === 201) return 'added';
    if (addRes.status === 400) {
      const err = await addRes.json().catch(() => null);
      if (JSON.stringify(err)?.includes('already')) return 'exists';
    }
    return 'error';
  } catch {
    return 'error';
  }
}

export async function addToSonarr(tmdbId: number): Promise<'added' | 'exists' | 'error'> {
  if (!SONARR_URL || !SONARR_KEY) return 'error';
  try {
    // Look up series by TMDB ID
    const lookupRes = await arrFetch(SONARR_URL, SONARR_KEY, `/api/v3/series/lookup?term=tmdb:${tmdbId}`);
    if (!lookupRes.ok) return 'error';
    const series = await lookupRes.json();
    if (!series?.length) return 'error';

    // Get quality profile + root folder
    const [profilesRes, foldersRes] = await Promise.all([
      arrFetch(SONARR_URL, SONARR_KEY, '/api/v3/qualityprofile'),
      arrFetch(SONARR_URL, SONARR_KEY, '/api/v3/rootfolder'),
    ]);
    const profiles = await profilesRes.json();
    const folders = await foldersRes.json();
    if (!profiles?.length || !folders?.length) return 'error';

    // Add series
    const addRes = await arrFetch(SONARR_URL, SONARR_KEY, '/api/v3/series', {
      method: 'POST',
      body: JSON.stringify({
        ...series[0],
        qualityProfileId: profiles[0].id,
        rootFolderPath: folders[0].path,
        monitored: true,
        seasonFolder: true,
        addOptions: { searchForMissingEpisodes: true },
      }),
    });

    if (addRes.status === 201) return 'added';
    if (addRes.status === 400) {
      const err = await addRes.json().catch(() => null);
      if (JSON.stringify(err)?.includes('already')) return 'exists';
    }
    return 'error';
  } catch {
    return 'error';
  }
}
