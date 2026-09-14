import { NextResponse } from 'next/server';
import { saveSubscription } from '@/lib/webpush';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const sub = await request.json();
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    return NextResponse.json({ error: 'invalid subscription' }, { status: 400 });
  }
  // The server later POSTs to every stored endpoint, so it must be a push
  // service address, not a LAN or loopback URL someone typed in.
  let endpointUrl: URL;
  try {
    endpointUrl = new URL(String(sub.endpoint));
  } catch {
    return NextResponse.json({ error: 'invalid subscription endpoint' }, { status: 400 });
  }
  if (endpointUrl.protocol !== 'https:') {
    return NextResponse.json({ error: 'subscription endpoint must be https' }, { status: 400 });
  }
  try {
    saveSubscription({ endpoint: String(sub.endpoint), keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
