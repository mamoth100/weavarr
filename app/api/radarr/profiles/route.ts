import { NextResponse } from 'next/server';
import { getRadarrQualityProfiles } from '@/lib/radarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function GET() {
  try {
    const profiles = await getRadarrQualityProfiles();
    return NextResponse.json({ profiles });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
