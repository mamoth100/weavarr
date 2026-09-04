import { getCleanupCandidates } from './cleanupCandidates';
import { deleteSonarrEpisodeFile, assertSeriesDeletable } from './sonarr';
import { getDismissedKeys } from './recentlyWatched';
import { refreshTvLibrary } from './mediaServer';
import { notifyAllChannels } from './notificationChannels';
import { getRawEnvValue } from './settings';

function episodeLabel(showTitle: string, seasonNumber: number, episodeNumber: number): string {
  return `${showTitle} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
}

/**
 * Opt-in hourly job: delete episode files the user has genuinely watched,
 * after a grace period. Deliberately narrow:
 * - real playback only ('Watched' candidates - a manual mark-watched or a
 *   nearly-done in-progress episode never qualifies)
 * - only after AUTO_CLEANUP_DAYS days have passed since the watch, so an
 *   accidental play or a rewatch urge doesn't lose the file instantly
 * - Cleanup Excluded Shows never appear as candidates, and the server-side
 *   delete guard is asserted again anyway
 * - anything cleared from Recently Watched stays untouched
 * Both settings are read off disk per run, so Settings changes (including
 * turning the whole thing off) apply without a restart. One notification per
 * run lists everything deleted - this must never be silent.
 */
export async function runAutoCleanup(): Promise<void> {
  const enabled = (await getRawEnvValue('ENABLE_AUTO_CLEANUP').catch(() => null)) === 'true';
  if (!enabled) return;

  const daysRaw = await getRawEnvValue('AUTO_CLEANUP_DAYS').catch(() => null);
  const parsed = daysRaw === null || daysRaw.trim() === '' ? 3 : Number(daysRaw);
  const days = Number.isFinite(parsed) && parsed >= 0 ? parsed : 3;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

  const [candidates, dismissed] = await Promise.all([getCleanupCandidates(100), getDismissedKeys()]);

  const deleted: string[] = [];
  for (const c of candidates) {
    if (c.reason !== 'Watched') continue;
    if (new Date(c.viewedAt).getTime() > cutoff) continue;
    if (dismissed.has(`tv-${c.seriesId}-${c.seasonNumber}-${c.episodeNumber}`)) continue;

    const label = episodeLabel(c.showTitle, c.seasonNumber, c.episodeNumber);
    try {
      await assertSeriesDeletable(c.seriesId);
      await deleteSonarrEpisodeFile(c.episodeId, c.episodeFileId);
      deleted.push(label);
      console.log(`[autoCleanup] deleted ${label} (watched ${c.viewedAt})`);
    } catch (err) {
      console.error(`[autoCleanup] failed to delete ${label}:`, err instanceof Error ? err.message : err);
    }
  }

  if (deleted.length === 0) return;

  try {
    await refreshTvLibrary();
  } catch {
    // Deletions already happened - the media server will notice on its own next scan.
  }

  // Own toggle (default on) so deletes can run quietly if the user prefers.
  const notify = (await getRawEnvValue('AUTO_CLEANUP_NOTIFY').catch(() => null)) !== 'false';
  if (!notify) return;

  const shown = deleted.slice(0, 6).join(', ');
  const more = deleted.length > 6 ? ` and ${deleted.length - 6} more` : '';
  const noun = deleted.length === 1 ? 'watched episode' : 'watched episodes';
  try {
    await notifyAllChannels('Auto-cleanup', `Deleted ${deleted.length} ${noun}: ${shown}${more}.`, 'import', '/watch');
  } catch (err) {
    console.error('[autoCleanup] notification failed:', err instanceof Error ? err.message : err);
  }
}
