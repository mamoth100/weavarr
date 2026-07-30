import { NextResponse } from 'next/server';
import { getMenuConfig } from '@/lib/settings';

export async function GET() {
  try {
    const config = await getMenuConfig();
    return NextResponse.json(config);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
