import { NextResponse } from 'next/server';
import { exec } from 'child_process';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST() {
  // Fire the restart after the response has had time to reach the browser -
  // this command kills the very process handling this request.
  setTimeout(() => {
    exec('sudo systemctl restart weavarr', (err) => {
      if (err) console.error('[settings/restart] failed:', err.message);
    });
  }, 500);

  return NextResponse.json({ restarting: true });
}
