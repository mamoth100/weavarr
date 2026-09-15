import { NextResponse } from 'next/server';
import { listJobs } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

/** Every background job with its interval, last outcome and next run. */
export async function GET() {
  return NextResponse.json({ jobs: listJobs() });
}
