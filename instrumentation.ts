/**
 * Background jobs. Every job is registered with lib/jobs.ts (the registry
 * behind Settings > Jobs), enabled or not, so the page lists all of them
 * with interval, last outcome, next run and a Run now button. An enabled
 * job runs once at boot and then on its interval. The registry (1) never
 * lets two runs of the same job overlap, because a slow media server used
 * to let a two-minute job outlast its own interval and the overlapping run
 * sent the same notification twice, and (2) records and logs a failed run
 * instead of swallowing it, since a job that fails every time for a month
 * is exactly the kind of thing the Logs tab exists to show.
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
    // "SQLite is an experimental feature" notice (from lib/db.ts's
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

    const { registerJob, JobSkipped } = await import('./lib/jobs');

    const MINUTE = 60 * 1000;
    const HOUR = 60 * MINUTE;
    const DAY = 24 * HOUR;

    // Local dev keeps its own untracked data/notified-imports.json (gitignored,
    // never synced with the Pi's) - starting `npm run dev` locally would treat
    // everything the Pi already notified about as new and re-send real
    // Pushover pings. Only the Pi's .env.local should set this to 'true'.
    {
      const { checkForNewPlexImports } = await import('./lib/notifyOnPlexImport');
      await registerJob({
        name: 'importNotify',
        label: 'Import notifications',
        description: 'Watches Radarr and Sonarr history for new imports and sends the "ready to watch" notification once the file is in Plex or Jellyfin.',
        everyMs: 2 * MINUTE,
        enabled: process.env.ENABLE_IMPORT_NOTIFICATIONS === 'true',
        enableHint: 'Turn on Import Notifications under Settings > App Config.',
        run: checkForNewPlexImports,
      });
    }

    // Same untracked-state, Pi-only caveat as the import poller above -
    // data/connection-health.json isn't synced with local dev either.
    {
      const { checkConnectionHealth } = await import('./lib/connectionHealth');
      await registerJob({
        name: 'connectionHealth',
        label: 'Connection health',
        description: 'Probes every configured service and sends an alert when one goes down or comes back.',
        everyMs: 10 * MINUTE,
        enabled: process.env.ENABLE_CONNECTION_ALERTS === 'true',
        enableHint: 'Turn on Connection Drop Alerts under Settings > App Config.',
        run: checkConnectionHealth,
      });
    }

    // Opt-in: one notification when GitHub main moves past the running build.
    {
      const { checkForUpdateAndAlert } = await import('./lib/updateAlert');
      await registerJob({
        name: 'updateAlert',
        label: 'Update check',
        description: 'Compares the running build with the newest release and notifies once per new version.',
        everyMs: 6 * HOUR,
        enabled: process.env.ENABLE_UPDATE_ALERTS === 'true',
        enableHint: 'Turn on Update Available Alerts under Settings > App Config.',
        run: checkForUpdateAndAlert,
      });
    }

    // Opt-in auto-acquisition: watch the plex.tv account watchlist and add new
    // items to Radarr/Sonarr. Off by default on purpose.
    {
      const { syncPlexWatchlist } = await import('./lib/plexWatchlist');
      await registerJob({
        name: 'watchlistSync',
        label: 'Plex watchlist sync',
        description: 'Adds anything new on your plex.tv watchlist to Radarr or Sonarr.',
        everyMs: 10 * MINUTE,
        enabled: process.env.ENABLE_PLEX_WATCHLIST_SYNC === 'true',
        enableHint: 'Turn on Auto-add Plex Watchlist Items under Settings > Connections.',
        run: syncPlexWatchlist,
      });
    }

    // Only meaningful with both media servers configured - same untracked
    // data/watched-sync-state.json caveat as above applies here too. The
    // manual "Sync now" route runs the same job under the same name, so a
    // click during a timer run joins that run instead of starting another.
    {
      const { plexEnabled, jellyfinEnabled } = await import('./lib/mediaServer');
      const { syncWatchedBetweenServers } = await import('./lib/watchedSync');
      const bothServers = plexEnabled() && jellyfinEnabled();
      await registerJob({
        name: 'watchedSync',
        label: 'Watched sync',
        description: 'Copies watched marks between Plex and Jellyfin so both servers agree on what you have seen.',
        everyMs: 5 * MINUTE,
        enabled: process.env.ENABLE_WATCHED_SYNC === 'true' && bothServers,
        enableHint: bothServers ? 'Turn on Sync Watched Between Media Players under Settings > App Config.' : 'Needs both Plex and Jellyfin enabled.',
        run: syncWatchedBetweenServers,
      });
    }

    // Opt-in destructive job: delete watched episodes after a grace period.
    // Always scheduled because the enable toggle is read off disk on EVERY
    // run - flipping it off in Settings stops it within the hour, no restart.
    // Every safety check happens inside runAutoCleanup itself; disabled runs
    // are a no-op file read.
    {
      const { runAutoCleanup } = await import('./lib/autoCleanup');
      await registerJob({
        name: 'autoCleanup',
        label: 'Auto cleanup',
        description: 'Deletes watched episodes once the grace period has passed. Does nothing while Auto cleanup is off in Settings.',
        everyMs: HOUR,
        enabled: true,
        run: runAutoCleanup,
      });
    }

    // Always-on maintenance: clear queue debris - downloads marked completed
    // that never imported (second-grab duplicates, cleaned-up folders). The
    // arrs retry and error on these forever; nobody wants an alert, they want
    // them gone. Entry removal only, files untouched, logged in the Logs tab.
    {
      const { sweepStuckQueueItems } = await import('./lib/queueJanitor');
      await registerJob({
        name: 'queueJanitor',
        label: 'Queue janitor',
        description: 'Removes Radarr and Sonarr queue entries that finished or failed but never imported, after six hours. Files are never touched.',
        everyMs: HOUR,
        enabled: true,
        run: sweepStuckQueueItems,
      });
    }

    // Always-on maintenance: prune cached posters for titles deleted directly
    // in Radarr/Sonarr (Weavarr's own delete buttons already clean up their
    // poster - this catches the external deletes). Fail-closed inside the
    // sweep, so a down service just skips a round.
    {
      const { sweepOrphanedPosters } = await import('./lib/posterSweep');
      await registerJob({
        name: 'posterSweep',
        label: 'Poster cache sweep',
        description: 'Deletes cached posters for titles that no longer exist in Radarr or Sonarr.',
        everyMs: DAY,
        enabled: true,
        run: sweepOrphanedPosters,
      });
    }

    // Defaults ON (unlike the jobs above) - no external notification spam and
    // no multi-service prerequisite, so there's no real reason to make people
    // discover and opt into protecting their own data. Same !== 'false'
    // opt-out pattern lib/mediaServer.ts already uses for Plex. The retention
    // count goes through the same validated reader the Settings page uses, so
    // a negative value cannot turn into "delete every backup".
    {
      const { createBackup, pruneBackups, listBackups } = await import('./lib/backup');
      const { backupRetentionCount } = await import('./lib/settings');
      await registerJob({
        name: 'scheduledBackup',
        label: 'Scheduled backup',
        description: 'Zips the settings and data folder once a day and keeps the newest few, per Backups to Keep.',
        everyMs: DAY,
        enabled: process.env.ENABLE_SCHEDULED_BACKUPS !== 'false',
        enableHint: 'Enable Scheduled Backups under Settings > Backup/Restore.',
        run: async () => {
          // Skip the boot-time run when a backup is younger than a day: on a
          // setup afternoon with ten restarts, count-based retention otherwise
          // pushed out every older daily backup.
          const [newest] = await listBackups();
          if (newest && Date.now() - new Date(newest.createdAt).getTime() < DAY) {
            throw new JobSkipped('A backup from the last day already exists');
          }
          await createBackup();
          await pruneBackups(backupRetentionCount());
        },
      });
    }
  }
}
