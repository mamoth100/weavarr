import { NextResponse } from 'next/server';
import { getReadyToWatch } from '@/lib/readyToWatch';

export async function GET() {
  try {
    const items = await getReadyToWatch();
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
