import { NextRequest, NextResponse } from 'next/server';

const RADARR_URL = process.env.RADARR_URL;
const RADARR_KEY = process.env.RADARR_KEY;
const SONARR_URL = process.env.SONARR_URL;
const SONARR_KEY = process.env.SONARR_KEY;

async function arrGet(base: string, key: string, path: string) {
  const res = await fetch(`${base}${path}`, {
    headers: { 'X-Api-Key': key },
    cache: 'no-store',
  });
  return res.json();
}

async function arrPost(base: string, key: string, path: string, body: unknown) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'X-Api-Key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  });
}

export async function POST(req: NextRequest) {
  const { tmdbId, mediaType } = await req.json();

  if (mediaType === 'movie') {
    if (!RADARR_URL || !RADARR_KEY) return NextResponse.json({ status: 'error' });
    try {
      const movies = await arrGet(RADARR_URL, RADARR_KEY, `/api/v3/movie/lookup/tmdb?tmdbId=${tmdbId}`);
      if (!movies?.length) return NextResponse.json({ status: 'error' });
      const [profiles, folders] = await Promise.all([
        arrGet(RADARR_URL, RADARR_KEY, '/api/v3/qualityprofile'),
        arrGet(RADARR_URL, RADARR_KEY, '/api/v3/rootfolder'),
      ]);
      const res = await arrPost(RADARR_URL, RADARR_KEY, '/api/v3/movie', {
        ...movies[0],
        qualityProfileId: profiles[0].id,
        rootFolderPath: folders[0].path,
        monitored: true,
        addOptions: { searchForMovie: true },
      });
      if (res.status === 201) return NextResponse.json({ status: 'added' });
      const err = await res.json().catch(() => null);
      if (JSON.stringify(err)?.toLowerCase().includes('already'))
        return NextResponse.json({ status: 'exists' });
      return NextResponse.json({ status: 'error' });
    } catch {
      return NextResponse.json({ status: 'error' });
    }
  }

  if (mediaType === 'tv') {
    if (!SONARR_URL || !SONARR_KEY) return NextResponse.json({ status: 'error' });
    try {
      const series = await arrGet(SONARR_URL, SONARR_KEY, `/api/v3/series/lookup?term=tmdb:${tmdbId}`);
      if (!series?.length) return NextResponse.json({ status: 'error' });
      const [profiles, folders] = await Promise.all([
        arrGet(SONARR_URL, SONARR_KEY, '/api/v3/qualityprofile'),
        arrGet(SONARR_URL, SONARR_KEY, '/api/v3/rootfolder'),
      ]);
      const res = await arrPost(SONARR_URL, SONARR_KEY, '/api/v3/series', {
        ...series[0],
        qualityProfileId: profiles[0].id,
        rootFolderPath: folders[0].path,
        monitored: true,
        seasonFolder: true,
        addOptions: { searchForMissingEpisodes: true },
      });
      if (res.status === 201) return NextResponse.json({ status: 'added' });
      const err = await res.json().catch(() => null);
      if (JSON.stringify(err)?.toLowerCase().includes('already'))
        return NextResponse.json({ status: 'exists' });
      return NextResponse.json({ status: 'error' });
    } catch {
      return NextResponse.json({ status: 'error' });
    }
  }

  return NextResponse.json({ status: 'error' });
}
