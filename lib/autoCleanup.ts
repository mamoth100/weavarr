import { getCleanupCandidates, type CleanupCandidate } from './cleanupCandidates';
import { deleteSonarrEpisodeFile, assertSeriesDeletable } from './sonarr';
import { getDismissedKeys } from './recentlyWatched';
import { refreshTvLibrary } from './mediaServer';
import { notifyAllChannels } from './notificationChannels';
import { getRawEnvValue } from './settings';

function episodeLabel(showTitle: string, seasonNumber: number, episodeNumber: number): string {
  return `${showTitle} S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
}

/** The saved auto-delete config, read off disk so Settings changes apply without a restart. */
async function readAutoCleanupConfig(): Promise<{ enabled: boolean; days: number; allowMarked: boolean }> {
  const [enabledRaw, daysRaw, markedRaw] = await Promise.all([
    getRawEnvValue('ENABLE_AUTO_CLEANUP').catch(() => null),
    getRawEnvValue('AUTO_CLEANUP_DAYS').catch(() => null),
    getRawEnvValue('ENABLE_AUTO_CLEANUP_MARKED').catch(() => null),
  ]);
  const parsed = daysRaw === null || daysRaw.trim() === '' ? 3 : Number(daysRaw);
  return {
    enabled: enabledRaw === 'true',
    days: Number.isFinite(parsed) && parsed >= 0 ? parsed : 3,
    allowMarked: markedRaw === 'true',
  };
}

/**
 * When this candidate's grace clock started, or null when it doesn't qualify
 * for auto-delete at all under the current config. The one place the
 * qualification rules live - the hourly job and the chopping-block preview
 * must always agree.
 */
function graceStartFor(c: CleanupCandidate, allowMarked: boolean): number | null {
  if (c.reason === 'Watched') return new Date(c.viewedAt).getTime();
  if (c.reason === 'Watched to cleanup threshold') return new Date(c.thresholdFirstSeen ?? c.viewedAt).getTime();
  if (/% watched$/.test(c.reason)) return c.thresholdFirstSeen ? new Date(c.thresholdFirstSeen).getTime() : null;
  if (c.reason === 'Marked watched manually' && allowMarked) return new Date(c.viewedAt).getTime();
  return null;
}

export interface ChoppingBlockItem {
  label: string;
  reason: string;
  /** When the grace period runs out - already in the past means "goes on the next hourly check". */
  deleteAt: string;
}

/** What auto-delete would remove and when, under the currently saved settings - the Settings "chopping block" preview. Never deletes anything. */
export async function getChoppingBlock(): Promise<{ enabled: boolean; days: number; allowMarked: boolean; items: ChoppingBlockItem[] }> {
  const cfg = await readAutoCleanupConfig();
  const [candidates, dismissed] = await Promise.all([getCleanupCandidates(100), getDismissedKeys()]);
  const graceMs = cfg.days * 24 * 60 * 60 * 1000;

  const items: ChoppingBlockItem[] = [];
  for (const c of candidates) {
    if (dismissed.has(`tv-${c.seriesId}-${c.seasonNumber}-${c.episodeNumber}`)) continue;
    const start = graceStartFor(c, cfg.allowMarked);
    if (start === null) continue;
    items.push({
      label: episodeLabel(c.showTitle, c.seasonNumber, c.episodeNumber),
      reason: c.reason,
      deleteAt: new Date(start + graceMs).toISOString(),
    });
  }
  items.sort((a, b) => a.deleteAt.localeCompare(b.deleteAt));
  return { ...cfg, items };
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
  // Computing candidates ALSO records threshold sightings (the memory that
  // tells a threshold watch apart from a manual mark later). That labeling
  // evidence matters even while auto-delete is off, so the hourly
  // observation pass always runs; only the deleting is gated.
  const [candidates, dismissed] = await Promise.all([getCleanupCandidates(100), getDismissedKeys()]);

  const cfg = await readAutoCleanupConfig();
  if (!cfg.enabled) return;
  const cutoff = Date.now() - cfg.days * 24 * 60 * 60 * 1000;

  const deleted: string[] = [];
  for (const c of candidates) {
    const graceStart = graceStartFor(c, cfg.allowMarked);
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
