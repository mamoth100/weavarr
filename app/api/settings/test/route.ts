import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { testGroup } from '@/lib/connectionTests';
import { getRawEnvValue, SETTINGS_SCHEMA } from '@/lib/settings';

// Never statically cache - this always reflects live external/local state, and Docker builds (no secrets at build time) can otherwise cause Next.js to wrongly freeze an early error response as a permanent static page.
export const dynamic = 'force-dynamic';


export async function POST(request: Request) {
  const { group, values } = await request.json();
  if (!group) return NextResponse.json({ ok: false, message: 'group required' }, { status: 400 });

  try {
    // Any field in this group left blank (unedited secret) falls back to
    // what's actually saved on disk, so testing works without retyping keys.
    const fieldsInGroup = SETTINGS_SCHEMA.filter((f) => f.group === group);
    const effective: Record<string, string> = { ...values };

    // A saved secret is only sent to the saved URL. Filling blanks from disk
    // is what makes "Test" work without retyping keys, but with a different
    // URL in the request it would hand the real key to whatever address the
    // caller typed, and anyone on the LAN can call this route.
    const urlField = fieldsInGroup.find((f) => /_URL$/.test(f.key) && !f.secret);
    let urlChanged = false;
    if (urlField) {
      const typed = (effective[urlField.key] ?? '').trim().replace(/\/$/, '');
      const saved = ((await getRawEnvValue(urlField.key)) ?? '').trim().replace(/\/$/, '');
      urlChanged = typed !== '' && saved !== '' && typed !== saved;
    }
    for (const field of fieldsInGroup) {
      if (effective[field.key]) continue;
      if (field.secret && urlChanged) continue;
      const raw = await getRawEnvValue(field.key);
      if (raw) effective[field.key] = raw;
    }
    if (urlChanged && fieldsInGroup.some((f) => f.secret && !effective[f.key])) {
      return NextResponse.json({ ok: false, message: 'The URL changed. Enter the key or token again to test it against the new address.' });
    }
    const result = await testGroup(group, effective);
    // The most common first-run mistake: a localhost address typed into an
    // app that runs in its own container. Say so at the moment it fails,
    // rather than leaving people to guess from "connection refused".
    if (!result.ok && urlField && /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(effective[urlField.key] ?? '') && existsSync('/.dockerenv')) {
      result.message = `${result.message}. Inside Docker, localhost is Weavarr's own container. Use this machine's IP address instead, for example http://192.168.1.20:8989.`;
    }
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}
