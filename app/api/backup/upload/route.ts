import { NextResponse } from 'next/server';
import { saveUploadedBackup } from '@/lib/backup';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }
    const buffer = Buffer.from(await file.arrayBuffer());
    const backup = await saveUploadedBackup(file.name, buffer);
    return NextResponse.json({ backup });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
