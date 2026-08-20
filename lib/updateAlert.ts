import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { checkForUpdate, localCommit } from './versionCheck';
import { notifyAllChannels } from './notificationChannels';

const STATE_FILE = path.join(process.cwd(), 'data', 'update-alert-state.json');

/**
 * Pushes one notification when the version check first sees a newer main
 * commit. The notified-once guard is per commit: a new update after the
 * last one alerts again, but the same update never repeats across the
 * job's runs or restarts.
 */
export async function checkForUpdateAndAlert(): Promise<void> {
  const { latest, updateAvailable } = await checkForUpdate();
  if (updateAvailable !== true || !latest) return;

  let lastNotified: string | null = null;
  try {
    lastNotified = JSON.parse(await readFile(STATE_FILE, 'utf8')).lastNotified ?? null;
  } catch {}
  if (lastNotified === latest) return;

  await notifyAllChannels(
    'Update available',
    `A newer Weavarr build is out (${latest}, running ${localCommit()}). Pull and rebuild to update.`,
    'alert',
    '/settings'
  );
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify({ lastNotified: latest }), 'utf8');
  console.log(`[updateAlert] notified about ${latest}`);
}
