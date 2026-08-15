import { NextResponse } from 'next/server';
import { checkPlexPin } from '@/lib/plexAuth';
import { updateSettings } from '@/lib/settings';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/**
 * Polls a sign-in PIN. Once the user approves it on plex.tv, the token is
 * saved straight into PLEX_TOKEN (same path as a manual settings save, so it
 * gets the usual .env.local backup) and the client is told it's done.
 */
export async function GET(request: Request, { params }: { params: { pinId: string } }) {
  const pinId = Number(params.pinId);
  if (!Number.isInteger(pinId) || pinId <= 0) {
    return NextResponse.json({ error: 'Invalid pin id' }, { status: 400 });
  }
  try {
    const token = await checkPlexPin(pinId);
    if (!token) return NextResponse.json({ status: 'pending' });
    await updateSettings({ PLEX_TOKEN: token });
    return NextResponse.json({ status: 'saved' });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
