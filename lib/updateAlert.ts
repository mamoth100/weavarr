import path from 'path';
import { readJsonState, writeJsonAtomic } from './jsonState';
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

  const lastNotified = (await readJsonState<{ lastNotified?: string | null }>(STATE_FILE, {})).lastNotified ?? null;
  if (lastNotified === latest) return;

  await notifyAllChannels(
    'Update available',
    `A newer Weavarr build is out (${latest}, running ${localCommit()}). Pull and rebuild to update.`,
    'update',
    '/settings'
  );
  await writeJsonAtomic(STATE_FILE, { lastNotified: latest });
  console.log(`[updateAlert] notified about ${latest}`);
}
