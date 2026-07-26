import { NextResponse } from 'next/server';
import { getPairedShield } from '@/lib/shieldPairing';

// Reads pairing state from disk on every request — must not get frozen at
// build time (same trap that hit the discover route: no fetch() calls means
// no implicit dynamic signal for Next.js).
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const shield = await getPairedShield();
    return NextResponse.json({ paired: shield ? { name: shield.name, host: shield.host } : null });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
