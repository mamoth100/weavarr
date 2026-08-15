import { NextResponse } from 'next/server';
import { createPlexPin } from '@/lib/plexAuth';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/** Starts a Plex sign-in: returns a PIN id to poll and the plex.tv login URL to open. */
export async function POST() {
  try {
    const pin = await createPlexPin();
    return NextResponse.json(pin);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
