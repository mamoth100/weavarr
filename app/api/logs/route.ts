import { NextResponse } from 'next/server';
import { getLogs } from '@/lib/logBuffer';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ logs: getLogs() });
}
