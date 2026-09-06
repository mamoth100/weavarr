import { NextResponse } from 'next/server';
import { fetchWithTimeout } from '@/lib/fetchTimeout';
import { restartNzbget } from '@/lib/nzbget';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/**
 * Restart a connected service through its own API - no Docker access needed,
 * so it works regardless of how the user runs their containers. Sonarr and
 * Radarr expose POST /system/restart; SABnzbd uses api?mode=restart.
 */
export async function POST(request: Request) {
  const { service } = await request.json();

  try {
    if (service === 'sonarr' || service === 'radarr') {
      const url = service === 'sonarr' ? process.env.SONARR_URL : process.env.RADARR_URL;
      const key = service === 'sonarr' ? process.env.SONARR_KEY : process.env.RADARR_KEY;
      if (!url || !key) return NextResponse.json({ error: `${service} is not configured` }, { status: 400 });
      const res = await fetchWithTimeout(`${url}/api/v3/system/restart`, {
        method: 'POST',
        headers: { 'X-Api-Key': key },
        cache: 'no-store',
      });
      if (!res.ok) throw new Error(`Restart request failed: ${res.status}`);
    } else if (service === 'sabnzbd') {
      const url = process.env.SABNZBD_URL;
      const key = process.env.SABNZBD_API_KEY;
      if (!url || !key) return NextResponse.json({ error: 'SABnzbd is not configured' }, { status: 400 });
      const res = await fetchWithTimeout(`${url}/api?mode=restart&apikey=${encodeURIComponent(key)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`Restart request failed: ${res.status}`);
    } else if (service === 'nzbget') {
      await restartNzbget();
    } else {
      return NextResponse.json({ error: 'service must be sonarr, radarr, sabnzbd or nzbget' }, { status: 400 });
    }
    return NextResponse.json({ restarting: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
