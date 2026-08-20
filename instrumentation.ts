export async function register() {
  // First thing, before any job can log: route console output into the
  // in-memory ring buffer behind the Settings Logs tab.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { patchConsole } = await import('./lib/logBuffer');
    patchConsole();

    // Node's default warning printer goes through console.error, so its
    // "SQLite is an experimental feature" notice (from lib/watchlistDb.ts's
    // node:sqlite import) lands in the user-facing Logs tab as a scary
    // ERROR. Experimental-feature notices are developer chatter, not
    // something a self-hoster can act on - drop them, keep everything else
    // (deprecations, runtime warnings) flowing to the log as before.
    process.removeAllListeners('warning');
    process.on('warning', (warning) => {
      if (warning.name === 'ExperimentalWarning') return;
      console.error(warning.stack ?? `${warning.name}: ${warning.message}`);
    });

    // Doubles as a restart marker in the Logs tab and proof the buffer works.
    console.log('[weavarr] server started');
  }

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

  // Same untracked-state, Pi-only caveat as the import poller above -
  // data/connection-health.json isn't synced with local dev either.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.ENABLE_CONNECTION_ALERTS === 'true') {
    const { checkConnectionHealth } = await import('./lib/connectionHealth');

    checkConnectionHealth().catch(() => {});

    const HEALTH_POLL_INTERVAL_MS = 10 * 60 * 1000;
    setInterval(() => {
      checkConnectionHealth().catch(() => {});
    }, HEALTH_POLL_INTERVAL_MS);
  }

  // Opt-in: one notification when GitHub main moves past the running build.
  // Dormant while the repo is private (the version check returns "can't
  // tell") - flipping the repo public wakes it with no changes.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.ENABLE_UPDATE_ALERTS === 'true') {
    const { checkForUpdateAndAlert } = await import('./lib/updateAlert');

    checkForUpdateAndAlert().catch(() => {});

    const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
    setInterval(() => {
      checkForUpdateAndAlert().catch(() => {});
    }, UPDATE_CHECK_INTERVAL_MS);
  }

  // Opt-in auto-acquisition: watch the plex.tv account watchlist and add new
  // items to Radarr/Sonarr. Off by default on purpose.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.ENABLE_PLEX_WATCHLIST_SYNC === 'true') {
    const { syncPlexWatchlist } = await import('./lib/plexWatchlist');

    syncPlexWatchlist().catch((err) => {
      console.error('[watchlistSync] poll failed:', err instanceof Error ? err.message : err);
    });

    const WATCHLIST_POLL_INTERVAL_MS = 10 * 60 * 1000;
    setInterval(() => {
      syncPlexWatchlist().catch((err) => {
        console.error('[watchlistSync] poll failed:', err instanceof Error ? err.message : err);
      });
    }, WATCHLIST_POLL_INTERVAL_MS);
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

  // Always-on maintenance: prune cached posters for titles deleted directly
  // in Radarr/Sonarr (Weavarr's own delete buttons already clean up their
  // poster - this catches the external deletes). Fail-closed inside the
  // sweep, so a down service just skips a round.
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { sweepOrphanedPosters } = await import('./lib/posterSweep');

    sweepOrphanedPosters().catch(() => {});

    const POSTER_SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;
    setInterval(() => {
      sweepOrphanedPosters().catch(() => {});
    }, POSTER_SWEEP_INTERVAL_MS);
  }

  // Defaults ON (unlike the jobs above) - no external notification spam and
  // no multi-service prerequisite, so there's no real reason to make people
  // discover and opt into protecting their own data. Same !== 'false'
  // opt-out pattern lib/mediaServer.ts already uses for Plex.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.ENABLE_SCHEDULED_BACKUPS !== 'false') {
    const { createBackup, pruneBackups } = await import('./lib/backup');
    const retain = Number(process.env.BACKUP_RETENTION_COUNT) || 10;

    const runBackup = () => createBackup().then(() => pruneBackups(retain)).catch(() => {});

    runBackup();
    const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
    setInterval(runBackup, BACKUP_INTERVAL_MS);
  }
}
