import { NextResponse } from 'next/server';
import { getMissingAiredEpisodes } from '@/lib/sonarr';

export async function GET() {
  try {
    const episodes = await getMissingAiredEpisodes();
    return NextResponse.json({ episodes });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
