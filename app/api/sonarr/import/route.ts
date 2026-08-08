import { NextResponse } from 'next/server';
import { forceImportSonarr } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const { downloadId } = await request.json();
  if (!downloadId) return NextResponse.json({ error: 'downloadId required' }, { status: 400 });

  try {
    const result = await forceImportSonarr(downloadId);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
