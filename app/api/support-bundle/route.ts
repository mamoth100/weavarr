import { NextResponse } from 'next/server';
import { buildSupportBundle } from '@/lib/supportBundle';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { filename, buffer } = await buildSupportBundle();
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
