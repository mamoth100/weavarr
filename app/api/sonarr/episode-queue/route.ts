import { NextResponse } from 'next/server';
import { getEpisodeDownloadProgress } from '@/lib/downloadProgress';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const episodes = await getEpisodeDownloadProgress();
    return NextResponse.json({ episodes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
