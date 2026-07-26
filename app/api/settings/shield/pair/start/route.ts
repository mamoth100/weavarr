import { NextResponse } from 'next/server';
import { startPairing } from '@/lib/shieldPairing';

export async function POST(request: Request) {
  const { host, name } = await request.json();
  if (!host || !name) return NextResponse.json({ error: 'host and name required' }, { status: 400 });

  try {
    await startPairing(host, name);
    return NextResponse.json({ needsCode: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
