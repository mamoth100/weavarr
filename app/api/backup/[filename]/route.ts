import { NextResponse } from 'next/server';
import { deleteBackup, readBackupFile } from '@/lib/backup';

export const dynamic = 'force-dynamic';

export async function GET(request: Request, { params }: { params: { filename: string } }) {
  try {
    const filename = decodeURIComponent(params.filename);
    const buffer = await readBackupFile(filename);
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
