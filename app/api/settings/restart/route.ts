import { NextResponse } from 'next/server';
import { exec } from 'child_process';

export async function POST() {
  // Fire the restart after the response has had time to reach the browser —
  // this command kills the very process handling this request.
  setTimeout(() => {
    exec('sudo systemctl restart weavarr', (err) => {
      if (err) console.error('[settings/restart] failed:', err.message);
    });
  }, 500);

  return NextResponse.json({ restarting: true });
}
