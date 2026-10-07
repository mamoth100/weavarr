import { NextResponse } from 'next/server';
import { listReplacementOptions } from '@/lib/replaceFile';
import { parseReplaceTarget } from '@/lib/replaceTarget';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const target = parseReplaceTarget(await request.json().catch(() => ({})));
  if (!target) return NextResponse.json({ error: 'A movie id, or a series id with season and episode numbers, is required' }, { status: 400 });
  try {
    return NextResponse.json(await listReplacementOptions(target));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
