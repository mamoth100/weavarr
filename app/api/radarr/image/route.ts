import { NextResponse } from 'next/server';
import { getCachedPoster } from '@/lib/posterCache';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


// Stripped of any trailing slash - see the same fix in lib/plex.ts for why.
const RADARR_URL = process.env.RADARR_URL?.replace(/\/$/, '');
const RADARR_KEY = process.env.RADARR_KEY;

export async function GET(request: Request) {
  if (!RADARR_URL || !RADARR_KEY) {
    return NextResponse.json({ error: 'Radarr is not configured' }, { status: 500 });
  }

  const idParam = new URL(request.url).searchParams.get('id');
  const id = idParam ? Number(idParam) : NaN;
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: 'invalid id' }, { status: 400 });
  }

  const buffer = await getCachedPoster('radarr', id, RADARR_URL, RADARR_KEY);
  if (!buffer) return NextResponse.json({ error: 'poster not found' }, { status: 404 });

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': 'image/jpeg',
      'Cache-Control': 'public, max-age=604800',
    },
  });
}
