import { NextResponse } from 'next/server';
import { getRadarrQualityProfiles } from '@/lib/radarr';

export async function GET() {
  try {
    const profiles = await getRadarrQualityProfiles();
    return NextResponse.json({ profiles });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
