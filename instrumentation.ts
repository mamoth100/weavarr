/**
 * Background jobs. Every job runs once at boot and then on its interval,
 * through `schedule`, which (1) never lets two runs of the same job overlap,
 * because a slow media server used to let a two-minute job outlast its own
 * interval and the overlapping run sent the same notification twice, and
 * (2) logs a failed run instead of swallowing it, since a job that fails
 * every time for a month is exactly the kind of thing the Logs tab exists
 * to show.
 */
export async function register() {
  // A block, not an early return: register() is compiled for the edge
  // runtime too (middleware.ts exists), and webpack only drops the node-only
  // imports below when they sit inside a NEXT_RUNTIME check it can evaluate
  // at build time. An early return leaves them reachable and the edge build
  // fails on "Can't resolve 'fs/promises'".
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // First thing, before any job can log: route console output into the
    // in-memory ring buffer behind the Settings Logs tab.
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

    const { runExclusive } = await import('./lib/runExclusive');

    // A const, not a function declaration: TypeScript refuses function
    // declarations inside a block in a module.
    const schedule = (name: string, everyMs: number, job: () => Promise<unknown>) => {
      const run = () => {
        runExclusive(name, job).catch((err) => {
          console.error(`[${name}] run failed:`, err instanceof Error ? err.message : err);
        });
      };
      run();
      setInterval(run, everyMs);
    };

    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;

    // Local dev keeps its own untracked data/notified-imports.json (gitignored,
    // never synced with the Pi's) - starting `npm run dev` locally would treat
    // everything the Pi already notified about as new and re-send real
    // Pushover pings. Only the Pi's .env.local should set this to 'true'.
    if (process.env.ENABLE_IMPORT_NOTIFICATIONS === 'true') {
      const { checkForNewPlexImports } = await import('./lib/notifyOnPlexImport');
      schedule('importNotify', 2 * MINUTE, checkForNewPlexImports);
    }

    // Same untracked-state, Pi-only caveat as the import poller above -
    // data/connection-health.json isn't synced with local dev either.
    if (process.env.ENABLE_CONNECTION_ALERTS === 'true') {
      const { checkConnectionHealth } = await import('./lib/connectionHealth');
      schedule('connectionHealth', 10 * MINUTE, checkConnectionHealth);
    }

    // Opt-in: one notification when GitHub main moves past the running build.
    if (process.env.ENABLE_UPDATE_ALERTS === 'true') {
      const { checkForUpdateAndAlert } = await import('./lib/updateAlert');
      schedule('updateAlert', 6 * HOUR, checkForUpdateAndAlert);
    }

    // Opt-in auto-acquisition: watch the plex.tv account watchlist and add new
    // items to Radarr/Sonarr. Off by default on purpose.
    if (process.env.ENABLE_PLEX_WATCHLIST_SYNC === 'true') {
      const { syncPlexWatchlist } = await import('./lib/plexWatchlist');
      schedule('watchlistSync', 10 * MINUTE, syncPlexWatchlist);
    }

    // Only meaningful with both media servers configured - same untracked
    // data/watched-sync-state.json caveat as above applies here too. The
    // manual "Sync now" route runs the same job under the same name, so a
    // click during a timer run joins that run instead of starting another.
    if (process.env.ENABLE_WATCHED_SYNC === 'true') {
      const { plexEnabled, jellyfinEnabled } = await import('./lib/mediaServer');
      if (plexEnabled() && jellyfinEnabled()) {
        const { syncWatchedBetweenServers } = await import('./lib/watchedSync');
        schedule('watchedSync', 5 * MINUTE, syncWatchedBetweenServers);
      }
    }

    // Opt-in destructive job: delete watched episodes after a grace period.
    // Scheduled unconditionally (unlike the boot-gated jobs above) because the
    // enable toggle is read off disk on EVERY run - flipping it off in Settings
    // stops it within the hour, no restart. Every safety check happens inside
    // runAutoCleanup itself; disabled runs are a no-op file read.
    {
      const { runAutoCleanup } = await import('./lib/autoCleanup');
      schedule('autoCleanup', HOUR, runAutoCleanup);
    }

    // Always-on maintenance: clear queue debris - downloads marked completed
    // that never imported (second-grab duplicates, cleaned-up folders). The
    // arrs retry and error on these forever; nobody wants an alert, they want
    // them gone. Entry removal only, files untouched, logged in the Logs tab.
    {
      const { sweepStuckQueueItems } = await import('./lib/queueJanitor');
      schedule('queueJanitor', HOUR, sweepStuckQueueItems);
    }

    // Always-on maintenance: prune cached posters for titles deleted directly
    // in Radarr/Sonarr (Weavarr's own delete buttons already clean up their
    // poster - this catches the external deletes). Fail-closed inside the
    // sweep, so a down service just skips a round.
    {
      const { sweepOrphanedPosters } = await import('./lib/posterSweep');
      schedule('posterSweep', 24 * HOUR, sweepOrphanedPosters);
    }

    // Defaults ON (unlike the jobs above) - no external notification spam and
    // no multi-service prerequisite, so there's no real reason to make people
    // discover and opt into protecting their own data. Same !== 'false'
    // opt-out pattern lib/mediaServer.ts already uses for Plex. The retention
    // count goes through the same validated reader the Settings page uses, so
    // a negative value cannot turn into "delete every backup".
    if (process.env.ENABLE_SCHEDULED_BACKUPS !== 'false') {
      const { createBackup, pruneBackups, listBackups } = await import('./lib/backup');
      const { backupRetentionCount } = await import('./lib/settings');
      const DAY = 24 * HOUR;
      schedule('scheduledBackup', DAY, async () => {
        // Skip the boot-time run when a backup is younger than a day: on a
        // setup afternoon with ten restarts, count-based retention otherwise
        // pushed out every older daily backup.
        const [newest] = await listBackups();
        if (newest && Date.now() - new Date(newest.createdAt).getTime() < DAY) return;
        await createBackup();
        await pruneBackups(backupRetentionCount());
      });
    }
  }
}
