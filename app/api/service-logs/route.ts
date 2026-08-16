import { NextRequest, NextResponse } from 'next/server';
import { getAggregatedLogs } from '@/lib/serviceLogs';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    return NextResponse.json(await getAggregatedLogs(req.nextUrl.searchParams.get('sabFull') === '1'));
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to aggregate logs' },
      { status: 500 }
    );
  }
}
