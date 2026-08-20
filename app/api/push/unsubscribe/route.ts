import { NextResponse } from 'next/server';
import { deleteSubscription } from '@/lib/webpush';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const { endpoint } = await request.json();
  if (!endpoint) return NextResponse.json({ error: 'endpoint required' }, { status: 400 });
  try {
    deleteSubscription(String(endpoint));
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
