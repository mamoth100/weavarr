import { NextResponse } from 'next/server';
import { undismissRecentlyWatched } from '@/lib/recentlyWatched';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { key } = await request.json();
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  try {
    await undismissRecentlyWatched(key);
    return NextResponse.json({ undismissed: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
