import { NextResponse } from 'next/server';
import { getRawEnvValue } from '@/lib/settings';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


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
