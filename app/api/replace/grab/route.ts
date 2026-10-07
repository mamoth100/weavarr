import { NextResponse } from 'next/server';
import { replaceWithRelease } from '@/lib/replaceFile';
import { parseReplaceTarget } from '@/lib/replaceTarget';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const target = parseReplaceTarget(body);
  const guid = typeof body.guid === 'string' ? body.guid : '';
  const indexerId = Number(body.indexerId);
  if (!target || !guid || !Number.isInteger(indexerId)) {
    return NextResponse.json({ error: 'target, guid and indexerId are required' }, { status: 400 });
  }
  try {
    await replaceWithRelease(target, guid, indexerId);
    return NextResponse.json({ replaced: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
