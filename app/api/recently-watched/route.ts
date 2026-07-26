import { NextResponse } from 'next/server';
import { getRecentlyWatched } from '@/lib/recentlyWatched';

export async function GET() {
  try {
    const items = await getRecentlyWatched(30);
    return NextResponse.json({ items });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
