import { NextResponse } from 'next/server';
import { getAggregatedLogs } from '@/lib/serviceLogs';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json(await getAggregatedLogs());
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to aggregate logs' },
      { status: 500 }
    );
  }
}
