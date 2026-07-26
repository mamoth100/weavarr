import { NextResponse } from 'next/server';
import { testGroup } from '@/lib/connectionTests';
import { getRawEnvValue, SETTINGS_SCHEMA } from '@/lib/settings';

export async function POST(request: Request) {
  const { group, values } = await request.json();
  if (!group) return NextResponse.json({ ok: false, message: 'group required' }, { status: 400 });

  try {
    // Any field in this group left blank (unedited secret) falls back to
    // what's actually saved on disk, so testing works without retyping keys.
    const fieldsInGroup = SETTINGS_SCHEMA.filter((f) => f.group === group);
    const effective: Record<string, string> = { ...values };
    for (const field of fieldsInGroup) {
      if (!effective[field.key]) {
        const raw = await getRawEnvValue(field.key);
        if (raw) effective[field.key] = raw;
      }
    }
    const result = await testGroup(group, effective);
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json({ ok: false, message: err instanceof Error ? err.message : String(err) });
  }
}
