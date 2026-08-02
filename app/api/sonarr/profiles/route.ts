import { NextResponse } from 'next/server';
import { getSonarrQualityProfiles } from '@/lib/sonarr';

export async function GET() {
  try {
    const profiles = await getSonarrQualityProfiles();
    return NextResponse.json({ profiles });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
