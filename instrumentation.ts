export async function register() {
  // Local dev keeps its own untracked data/notified-imports.json (gitignored,
  // never synced with the Pi's) — starting `npm run dev` locally would treat
  // everything the Pi already notified about as new and re-send real
  // Pushover pings. Only the Pi's .env.local should set this to 'true'.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.ENABLE_IMPORT_NOTIFICATIONS === 'true') {
    const { checkForNewPlexImports } = await import('./lib/notifyOnPlexImport');

    checkForNewPlexImports().catch(() => {});

    const POLL_INTERVAL_MS = 2 * 60 * 1000;
    setInterval(() => {
      checkForNewPlexImports().catch(() => {});
    }, POLL_INTERVAL_MS);
  }

  // Only meaningful with both media servers configured - same untracked
  // data/watched-sync-state.json caveat as above applies here too.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.ENABLE_WATCHED_SYNC === 'true') {
    const { plexEnabled, jellyfinEnabled } = await import('./lib/mediaServer');
    if (plexEnabled() && jellyfinEnabled()) {
      const { syncWatchedBetweenServers } = await import('./lib/watchedSync');

      syncWatchedBetweenServers().catch(() => {});

      const SYNC_INTERVAL_MS = 5 * 60 * 1000;
      setInterval(() => {
        syncWatchedBetweenServers().catch(() => {});
      }, SYNC_INTERVAL_MS);
    }
  }
}
