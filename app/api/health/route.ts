import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/** Liveness for Docker's HEALTHCHECK and for anyone composing this behind a proxy with depends_on. Deliberately touches nothing external: a down Sonarr is not a down Weavarr. */
export async function GET() {
  return NextResponse.json({ ok: true, uptimeSeconds: Math.round(process.uptime()) });
}
