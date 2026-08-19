import { NextResponse } from 'next/server';
import { getDownloadProgress } from '@/lib/downloadProgress';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getDownloadProgress());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Progress fetch failed' },
      { status: 500 }
    );
  }
}
