import { NextResponse } from 'next/server';
import { getSabQueue } from '@/lib/sabnzbd';
import { getRadarrQueue } from '@/lib/radarr';
import { getSonarrQueue } from '@/lib/sonarr';

function errMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

export async function GET() {
  const [sab, radarr, sonarr] = await Promise.allSettled([
    getSabQueue(),
    getRadarrQueue(),
    getSonarrQueue(),
  ]);

  return NextResponse.json({
    sab: sab.status === 'fulfilled' ? sab.value : { error: errMessage(sab.reason) },
    radarr: radarr.status === 'fulfilled' ? radarr.value : { error: errMessage(radarr.reason) },
    sonarr: sonarr.status === 'fulfilled' ? sonarr.value : { error: errMessage(sonarr.reason) },
  });
}
