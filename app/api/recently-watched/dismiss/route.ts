import { NextResponse } from 'next/server';
import { dismissRecentlyWatched } from '@/lib/recentlyWatched';

export async function POST(request: Request) {
  const { key } = await request.json();
  if (!key) return NextResponse.json({ error: 'key required' }, { status: 400 });

  try {
    await dismissRecentlyWatched(key);
    return NextResponse.json({ dismissed: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
