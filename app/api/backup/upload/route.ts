import { NextResponse } from 'next/server';
import { saveUploadedBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

// A backup is config plus a small SQLite file and some JSON; a real one is a
// few megabytes. Anything past this is not a backup, and reading it into
// memory would take the process down on a Pi.
const MAX_UPLOAD_BYTES = 256 * 1024 * 1024;

export async function POST(request: Request) {
  try {
    const declared = Number(request.headers.get('content-length') ?? 0);
    if (declared > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'That file is larger than 256 MB, which is far bigger than any Weavarr backup' }, { status: 413 });
    }
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: 'That file is larger than 256 MB, which is far bigger than any Weavarr backup' }, { status: 413 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const backup = await saveUploadedBackup(file.name, buffer);
    return NextResponse.json({ backup });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
