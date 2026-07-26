import { NextResponse } from 'next/server';
import { submitPairingCode } from '@/lib/shieldPairing';

export async function POST(request: Request) {
  const { host, code } = await request.json();
  if (!host || !code) return NextResponse.json({ error: 'host and code required' }, { status: 400 });

  try {
    const shield = await submitPairingCode(host, code);
    return NextResponse.json({ paired: { name: shield.name, host: shield.host } });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
