import { NextResponse } from 'next/server';
import { getRawEnvValue } from '@/lib/settings';

export const dynamic = 'force-dynamic';

/**
 * The Trakt client id for the browser. Trakt's Cloudflare protection blocks
 * server-side calls, so the ratings are fetched from the browser, which
 * needs the id. It used to ship as NEXT_PUBLIC_TRAKT_CLIENT_ID, a build-time
 * value that the published image bakes in as undefined, so the Settings
 * field could never take effect. A Trakt client id is public by design
 * (every browser request carries it), so serving it here exposes nothing
 * the old approach did not.
 */
export async function GET() {
  const enabled = ((await getRawEnvValue('ENABLE_TRAKT')) ?? process.env.ENABLE_TRAKT ?? 'true') !== 'false';
  const clientId = enabled ? (await getRawEnvValue('TRAKT_CLIENT_ID')) ?? process.env.TRAKT_CLIENT_ID ?? '' : '';
  return NextResponse.json({ clientId });
}
