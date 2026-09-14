import { NextResponse } from 'next/server';
import { getSettingsStatus, updateSettings } from '@/lib/settings';

// Reads .env.local from disk on every request - forced dynamic so Next.js never
// statically caches a stale snapshot of it.
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const status = await getSettingsStatus();
    return NextResponse.json({ settings: status });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const { updates } = await request.json();
  if (!updates || typeof updates !== 'object') {
    return NextResponse.json({ error: 'updates object required' }, { status: 400 });
  }
  for (const [key, value] of Object.entries(updates as Record<string, unknown>)) {
    if (typeof value !== 'string') {
      return NextResponse.json({ error: `${key} must be text` }, { status: 400 });
    }
    if (/[\r\n]/.test(value)) {
      return NextResponse.json({ error: `${key} cannot contain a line break` }, { status: 400 });
    }
  }

  // Turning the warning off is what the toggle is for; a zero or negative
  // threshold is always a mistake, so refuse to save one.
  const warnCount = (updates as Record<string, unknown>).EPISODE_WARN_COUNT;
  if (typeof warnCount === 'string' && warnCount.trim() !== '') {
    const n = Number(warnCount);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: 'Big Add Warning Threshold must be a whole number, 1 or higher. To turn the warning off, use the Big Add Warning toggle instead.' }, { status: 400 });
    }
  }
  const retention = (updates as Record<string, unknown>).BACKUP_RETENTION_COUNT;
  if (typeof retention === 'string' && retention.trim() !== '') {
    const n = Number(retention);
    if (!Number.isInteger(n) || n < 1) {
      return NextResponse.json({ error: 'Backups to Keep must be a whole number, 1 or higher.' }, { status: 400 });
    }
  }
  const graceDays = (updates as Record<string, unknown>).AUTO_CLEANUP_DAYS;
  if (typeof graceDays === 'string' && graceDays.trim() !== '') {
    const n = Number(graceDays);
    if (!Number.isInteger(n) || n < 0) {
      return NextResponse.json({ error: 'Auto-Delete Grace Period must be a whole number of days, 0 or higher.' }, { status: 400 });
    }
  }

  try {
    await updateSettings(updates);
    return NextResponse.json({ saved: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
