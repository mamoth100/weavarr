import { NextResponse } from 'next/server';
import { checkForUpdate } from '@/lib/versionCheck';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/**
 * Just the update flag, for the sidebar. The full system-status endpoint
 * also hits Radarr/Sonarr for disk space and library counts, which is far
 * too much for something every page load asks. The GitHub call behind this
 * is cached for six hours, so the sidebar asking on every navigation costs
 * nothing in practice.
 */
export async function GET() {
  const { updateAvailable } = await checkForUpdate();
  return NextResponse.json({ updateAvailable });
}
