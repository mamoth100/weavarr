import { NextResponse } from 'next/server';
import { getVapidKeys } from '@/lib/webpush';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ key: getVapidKeys().publicKey });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
