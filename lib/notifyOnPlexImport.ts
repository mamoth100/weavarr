import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { getRadarrRecentImports } from './radarr';
import { getSonarrRecentImports, getSonarrUnairedCount } from './sonarr';
import { hasTitle, hasEpisode } from './mediaServer';
import { notifyAllChannels } from './notificationChannels';
import { getRawEnvValue } from './settings';

const STATE_FILE = path.join(process.cwd(), 'data', 'notified-imports.json');

// Keyed by "title:importDate" - a redownload gets a new import date, so it's
// treated as a distinct, notification-worthy event rather than a duplicate.
let notified: Set<string> | null = null;

async function loadNotified(): Promise<Set<string>> {
  if (notified) return notified;
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    notified = new Set(JSON.parse(raw));
  } catch {
    notified = new Set();
  }
  return notified;
}

async function persistNotified(): Promise<void> {
  if (!notified) return;
  await mkdir(path.dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(Array.from(notified)), 'utf8');
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
    getRadarrRecentImports(10),
    getSonarrRecentImports(10),
  ]);

  const items = [
    ...(radarrHistory.status === 'fulfilled' ? radarrHistory.value : []),
    ...(sonarrHistory.status === 'fulfilled' ? sonarrHistory.value : []),
  ];

  let changed = false;
  for (const item of items) {
    const key = `${item.title}:${item.date}`;
    if (seen.has(key)) continue;

    const label = item.episode ? `${item.title} ${item.episode}` : item.title;
    try {
      const inLibrary = item.seasonNumber !== undefined && item.episodeNumber !== undefined
        ? await hasEpisode(item.title, item.seasonNumber, item.episodeNumber)
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
