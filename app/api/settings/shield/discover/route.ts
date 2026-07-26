import { NextResponse } from 'next/server';
import { discoverShields } from '@/lib/shieldDiscovery';

// No fetch() calls here to give Next.js an implicit dynamic signal — mDNS
// discovery must re-run on every request, not get frozen at build time.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const shields = await discoverShields();
    return NextResponse.json({ shields });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
