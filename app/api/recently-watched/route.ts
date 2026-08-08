import { NextResponse } from 'next/server';
import { getRecentlyWatched } from '@/lib/recentlyWatched';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function GET() {
  try {
    const items = await getRecentlyWatched(30);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
