import { NextResponse } from 'next/server';
import { openPlexOnShield } from '@/lib/shieldControl';

export async function POST() {
  try {
    await openPlexOnShield();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
