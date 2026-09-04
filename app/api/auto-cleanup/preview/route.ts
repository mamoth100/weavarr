import { NextResponse } from 'next/server';
import { getChoppingBlock } from '@/lib/autoCleanup';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/** Read-only preview of what auto-delete would remove and when - nothing is deleted here. */
export async function GET() {
  try {
    return NextResponse.json(await getChoppingBlock());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
