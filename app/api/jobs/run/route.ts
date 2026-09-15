import { NextResponse } from 'next/server';
import { listJobs, runJobNow } from '@/lib/jobs';

export const dynamic = 'force-dynamic';

/**
 * Run now. Starts the job and answers at once; the Jobs page polls the list
 * while it runs, since a watched sync or a backup can take minutes. A job
 * already running is joined, not started twice.
 */
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body?.name === 'string' ? body.name : '';
  const job = listJobs().find((j) => j.name === name);
  if (!job) return NextResponse.json({ error: 'Unknown job' }, { status: 400 });
  if (!job.enabled) {
    return NextResponse.json({ error: `${job.label} is turned off${job.enableHint ? `. ${job.enableHint}` : ''}` }, { status: 400 });
  }
  const alreadyRunning = job.running;
  runJobNow(name).catch(() => {
    // Recorded on the job itself; the page shows it.
  });
  return NextResponse.json({ started: !alreadyRunning, running: true });
}
