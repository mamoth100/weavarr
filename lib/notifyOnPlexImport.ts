import path from 'path';
import { readJsonState, writeJsonAtomic } from './jsonState';
import { getRadarrRecentImports } from './radarr';
import { getSonarrRecentImports, getSonarrUnairedCount } from './sonarr';
import { hasTitle, hasEpisode } from './mediaServer';
import { notifyAllChannels } from './notificationChannels';
import { getRawEnvValue } from './settings';

const STATE_FILE = path.join(process.cwd(), 'data', 'notified-imports.json');

// Keyed by "<arr>:<history id>", one per import event, so a redownload (a
// new history row) notifies again while the same row never does twice.
// Older entries in the file use "title:importDate"; both are honoured so an
// upgrade does not re-announce anything.
let notified: Set<string> | null = null;

// History is read fifty rows deep so a season pack, which lands as one row
// per episode, is seen in full; with ten rows most of a pack was missed.
const HISTORY_WINDOW = 50;
// An import older than this is remembered silently rather than announced:
// it is stale news, and the first run after widening the window would
// otherwise ping for weeks of old imports.
const MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

async function loadNotified(): Promise<Set<string>> {
  if (notified) return notified;
  notified = new Set(await readJsonState<string[]>(STATE_FILE, []));
  return notified;
}

async function persistNotified(): Promise<void> {
  if (!notified) return;
  await writeJsonAtomic(STATE_FILE, Array.from(notified));
}

export async function checkForNewPlexImports(): Promise<void> {
  const seen = await loadNotified();

  // Read off disk (not boot-time process.env) so the Settings toggle applies
  // without a restart. Default on. Cached per series within this run - one
  // burst of imports for the same show costs one episode fetch, not ten.
  const includeUnaired = (await getRawEnvValue('IMPORT_NOTIFY_UNAIRED').catch(() => null)) !== 'false';
  const unairedCache = new Map<number, number>();
  async function unairedTail(seriesId: number | undefined): Promise<string> {
    if (!includeUnaired || seriesId === undefined) return '';
    try {
      let count = unairedCache.get(seriesId);
      if (count === undefined) {
        count = await getSonarrUnairedCount(seriesId);
        unairedCache.set(seriesId, count);
      }
      if (count === 0) return '';
      return count === 1 ? ' 1 unaired episode remains.' : ` ${count} unaired episodes remain.`;
    } catch {
      return ''; // the ping itself matters more than the tail
    }
  }

  const [radarrHistory, sonarrHistory] = await Promise.allSettled([
    getRadarrRecentImports(HISTORY_WINDOW),
    getSonarrRecentImports(HISTORY_WINDOW),
  ]);

  const items = [
    ...(radarrHistory.status === 'fulfilled' ? radarrHistory.value : []).map((i) => ({ ...i, key: `radarr:${i.historyId}` })),
    ...(sonarrHistory.status === 'fulfilled' ? sonarrHistory.value : []).map((i) => ({ ...i, key: `sonarr:${i.historyId}` })),
  ];

  let changed = false;
  for (const item of items) {
    const key = item.key;
    if (seen.has(key) || seen.has(`${item.title}:${item.date}`)) continue;
    const ageMs = Date.now() - new Date(item.date).getTime();
    if (Number.isFinite(ageMs) && ageMs > MAX_AGE_MS) {
      seen.add(key);
      changed = true;
      continue;
    }

    const label = item.episode ? `${item.title} ${item.episode}` : item.title;
    try {
      const inLibrary = item.seasonNumber !== undefined && item.episodeNumber !== undefined
        ? await hasEpisode(item.title, item.seasonNumber, item.episodeNumber, item.airDate ?? null)
        : await hasTitle(item.title);
      if (inLibrary) {
        const tail = item.episode ? await unairedTail(item.seriesId) : '';
        await notifyAllChannels('Ready to watch', `${label} is ready to watch.${tail}`, 'import', '/ready-to-watch');
        seen.add(key);
        changed = true;
        console.log(`[notifyOnPlexImport] sent notification for "${label}"`);
      }
    } catch (err) {
      console.error(`[notifyOnPlexImport] failed for "${label}":`, err instanceof Error ? err.message : err);
    }
  }

  if (changed) await persistNotified();
}
