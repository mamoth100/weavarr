import { NextResponse } from 'next/server';
import { getRawEnvValue } from '@/lib/settings';

// Lightweight enough for RequestButton to check before letting the
// "highest quality" checkbox be used, without a full /api/settings fetch.
export async function GET() {
  const [radarrHighest, sonarrHighest] = await Promise.all([
    getRawEnvValue('RADARR_HIGHEST_PROFILE'),
    getRawEnvValue('SONARR_HIGHEST_PROFILE'),
  ]);
  return NextResponse.json({
    radarrHighestConfigured: Boolean(radarrHighest?.trim()),
    sonarrHighestConfigured: Boolean(sonarrHighest?.trim()),
  });
}
