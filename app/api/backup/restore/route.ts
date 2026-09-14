import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { restoreBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { filename } = await request.json();
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });

  try {
    await restoreBackup(filename);
    // The running process still holds pre-restore state in memory (the
    // dismissed set, the sync's seen set, the import log) and would write it
    // back over the restored files within minutes, and the SQLite file was
    // just replaced under open handles. Exit and let the container's
    // restart policy bring the app back on the restored data, exactly as
    // /api/settings/restart does.
    const inDocker = existsSync('/.dockerenv');
    if (inDocker) setTimeout(() => process.exit(0), 500);
    return NextResponse.json({ restored: true, restarting: inDocker });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
