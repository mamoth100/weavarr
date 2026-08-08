import { NextResponse } from 'next/server';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

export async function POST() {
  // Exiting cleanly and relying on the container's own restart policy
  // (restart: unless-stopped in docker-compose.yml) is the idiomatic Docker
  // way to restart a service - no systemctl/sudo available inside the
  // container at all (confirmed live - neither binary exists in the
  // image), and this needs zero special permissions either way.
  setTimeout(() => {
    process.exit(0);
  }, 500);

  return NextResponse.json({ restarting: true });
}
