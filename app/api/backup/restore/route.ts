import { NextResponse } from 'next/server';
import { restoreBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { filename } = await request.json();
  if (!filename) return NextResponse.json({ error: 'filename required' }, { status: 400 });

  try {
    await restoreBackup(filename);
    return NextResponse.json({ restored: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
