import { NextResponse } from 'next/server';

// Stripped of any trailing slash - see the same fix in lib/plex.ts for why.
const RADARR_URL = process.env.RADARR_URL?.replace(/\/$/, '');
const RADARR_KEY = process.env.RADARR_KEY;

// Radarr's MediaCover URLs point at its LAN address, which isn't reachable
// from outside the home network - this proxies the image through the app's
// own server instead of ever sending that address to the browser.
const MEDIACOVER_PATH = /^\/MediaCover\/\d+\/[\w.-]+(\?.*)?$/;

export async function GET(request: Request) {
  if (!RADARR_URL || !RADARR_KEY) {
    return NextResponse.json({ error: 'Radarr is not configured' }, { status: 500 });
  }

  const path = new URL(request.url).searchParams.get('path');
  if (!path || !MEDIACOVER_PATH.test(path)) {
    return NextResponse.json({ error: 'invalid path' }, { status: 400 });
  }

  const res = await fetch(`${RADARR_URL}${path}`, { headers: { 'X-Api-Key': RADARR_KEY } });
  if (!res.ok) return NextResponse.json({ error: `Radarr image fetch failed: ${res.status}` }, { status: res.status });

  return new NextResponse(await res.arrayBuffer(), {
    headers: {
      'Content-Type': res.headers.get('content-type') ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
