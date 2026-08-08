import { NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import path from 'path';
import { deleteBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

const BACKUP_DIR = path.join(process.cwd(), 'data', 'backups');

function assertSafeFilename(filename: string): void {
  if (!filename || filename.includes('/') || filename.includes('\\') || filename.includes('..')) {
    throw new Error('Invalid backup filename');
  }
}

export async function GET(request: Request, { params }: { params: { filename: string } }) {
  try {
    const filename = decodeURIComponent(params.filename);
    assertSafeFilename(filename);
    const buffer = await readFile(path.join(BACKUP_DIR, filename));
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: { filename: string } }) {
  try {
    await deleteBackup(decodeURIComponent(params.filename));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
