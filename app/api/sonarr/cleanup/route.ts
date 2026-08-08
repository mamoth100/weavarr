import { NextResponse } from 'next/server';
import { deleteSonarrEpisodeFile } from '@/lib/sonarr';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const { episodeId, episodeFileId } = await request.json();
  if (!episodeId || !episodeFileId) {
    return NextResponse.json({ error: 'episodeId and episodeFileId required' }, { status: 400 });
  }

  try {
    await deleteSonarrEpisodeFile(episodeId, episodeFileId);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
