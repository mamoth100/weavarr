import { NextResponse } from 'next/server';
import { getAllSonarrSeries } from '@/lib/sonarr';

export async function GET() {
  try {
    const series = await getAllSonarrSeries();
    return NextResponse.json({ series });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
