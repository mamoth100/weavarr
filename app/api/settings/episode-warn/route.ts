import { NextResponse } from 'next/server';
import { getRawEnvValue } from '@/lib/settings';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';

/**
 * The big-add warning config for the show request modal. Read straight
 * off disk (not process.env) so Settings changes apply without a restart.
 * The toggle (default on) and threshold (default 30) are separate settings;
 * the client only needs the effective number, with 0 meaning "off".
 */
export async function GET() {
  const [enabledRaw, countRaw] = await Promise.all([
    getRawEnvValue('ENABLE_EPISODE_WARN'),
    getRawEnvValue('EPISODE_WARN_COUNT'),
  ]);
  const enabled = enabledRaw !== 'false';
  const n = countRaw === null || countRaw.trim() === '' ? 30 : Number(countRaw);
  const count = Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
  return NextResponse.json({ count: enabled ? count : 0 });
}
