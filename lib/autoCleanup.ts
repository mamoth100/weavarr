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
 * - real playback qualifies: a finished watch, or one played past the
 *   cleanup threshold (label 'Watched to cleanup threshold' or the live
 *   'N% watched' rows). A manual mark-watched only qualifies when the
 *   separate ENABLE_AUTO_CLEANUP_MARKED toggle is on.
 * - only after AUTO_CLEANUP_DAYS days have passed - counted from the watch
 *   for history rows, and from when the app first saw the episode past the
 *   threshold for threshold rows (their viewedAt is recomputed as "now" on
 *   every run and would never age otherwise)
 * - Cleanup Excluded Shows never appear as candidates, and the server-side
 *   delete guard is asserted again anyway
 * - anything cleared from Recently Watched stays untouched
 * All settings are read off disk per run, so Settings changes (including
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
  const allowMarked = (await getRawEnvValue('ENABLE_AUTO_CLEANUP_MARKED').catch(() => null)) === 'true';

  const [candidates, dismissed] = await Promise.all([getCleanupCandidates(100), getDismissedKeys()]);

  const deleted: string[] = [];
  for (const c of candidates) {
    let graceStart: number | null = null;
    if (c.reason === 'Watched') {
      graceStart = new Date(c.viewedAt).getTime();
    } else if (c.reason === 'Watched to cleanup threshold') {
      graceStart = new Date(c.thresholdFirstSeen ?? c.viewedAt).getTime();
    } else if (/% watched$/.test(c.reason)) {
      graceStart = c.thresholdFirstSeen ? new Date(c.thresholdFirstSeen).getTime() : null;
    } else if (c.reason === 'Marked watched manually' && allowMarked) {
      graceStart = new Date(c.viewedAt).getTime();
    }
    if (graceStart === null || graceStart > cutoff) continue;
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
