import { NextResponse } from 'next/server';
import { forceImportRadarr } from '@/lib/radarr';

export async function POST(request: Request) {
  const { downloadId } = await request.json();
  if (!downloadId) return NextResponse.json({ error: 'downloadId required' }, { status: 400 });

  try {
    const result = await forceImportRadarr(downloadId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
