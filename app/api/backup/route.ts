import { NextResponse } from 'next/server';
import { listBackups, createBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ backups: await listBackups() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST() {
  try {
    const backup = await createBackup();
    return NextResponse.json({ backup });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
