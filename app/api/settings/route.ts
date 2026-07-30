import { NextResponse } from 'next/server';
import { getSettingsStatus, updateSettings } from '@/lib/settings';

// Reads .env.local from disk on every request - forced dynamic so Next.js never
// statically caches a stale snapshot of it.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getSettingsStatus();
    return NextResponse.json({ settings: status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { updates } = await request.json();
  if (!updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'updates object required' }, { status: 400 });
  }

  try {
    await updateSettings(updates);
    return NextResponse.json({ saved: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
