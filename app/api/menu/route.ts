import { NextResponse } from 'next/server';
import { getMenuConfig } from '@/lib/settings';

// Reads .env.local from disk on every request - without this, Next.js statically
// caches this route at build time since it has no dynamic API usage of its own,
// serving a stale snapshot of the config forever.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const config = await getMenuConfig();
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
