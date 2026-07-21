import { mkdir, readFile, writeFile } from 'fs/promises';
import path from 'path';
import { getRadarrRecentImports } from './radarr';
import { getSonarrRecentImports } from './sonarr';
import { plexHasTitle, plexHasEpisode } from './plex';
import { sendPushoverNotification } from './pushover';

const STATE_FILE = path.join(process.cwd(), 'data', 'notified-imports.json');

// Keyed by "title:importDate" — a redownload gets a new import date, so it's
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
      const inPlex = item.seasonNumber !== undefined && item.episodeNumber !== undefined
        ? await plexHasEpisode(item.title, item.seasonNumber, item.episodeNumber)
        : await plexHasTitle(item.title);
      if (inPlex) {
        await sendPushoverNotification('Ready to watch', `${label} is now in Plex.`);
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
