import { getRadarrRecentImports } from './radarr';
import { getSonarrRecentImports } from './sonarr';
import { plexHasTitle } from './plex';
import { sendPushoverNotification } from './pushover';

// Resets on server restart — worst case is one duplicate notification right after a deploy.
const notified = new Set<string>();

export async function checkForNewPlexImports(): Promise<void> {
  const [radarrHistory, sonarrHistory] = await Promise.allSettled([
    getRadarrRecentImports(10),
    getSonarrRecentImports(10),
  ]);

  const items = [
    ...(radarrHistory.status === 'fulfilled' ? radarrHistory.value : []),
    ...(sonarrHistory.status === 'fulfilled' ? sonarrHistory.value : []),
  ];

  for (const item of items) {
    const key = `${item.title}:${item.date}`;
    if (notified.has(key)) continue;

    try {
      const inPlex = await plexHasTitle(item.title);
      if (inPlex) {
        await sendPushoverNotification('Ready to watch', `${item.title} is now in Plex.`);
        notified.add(key);
        console.log(`[notifyOnPlexImport] sent notification for "${item.title}"`);
      }
    } catch (err) {
      console.error(`[notifyOnPlexImport] failed for "${item.title}":`, err instanceof Error ? err.message : err);
    }
  }
}
