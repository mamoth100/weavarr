# Feature roadmap (vs. Seerr, minus approval/users)

Weavarr deliberately skips Seerr's approval workflow and multi-user system
(explicit choice, not a gap). This tracks the real feature differences
worth closing. First pass 2026-08-08 was from memory and had errors;
corrected and expanded 2026-08-08 by actually reading
https://github.com/seerr-team/seerr's source rather than relying on
recall. Note: "Overseerr" and "Jellyseerr" merged into "Seerr" (unified
project, now also supports Emby) - if researching this later, search for
Seerr, not Overseerr.

- [ ] **Plex Watchlist sync** - Seerr can auto-request whatever a user
      adds to their own Plex Watchlist. Weavarr has its own favorites
      system but nothing that watches Plex's built-in watchlist and acts
      on it.
- [ ] **Multiple Radarr/Sonarr instances** - Seerr lets you configure more
      than one of each (e.g. a separate 4K instance, or an anime-specific
      Sonarr) and pick per-request (`RadarrModal`/`SonarrModal` in their
      Settings UI). Weavarr is single-instance only - one Radarr, one
      Sonarr, full stop. Real architectural gap, not a small one -
      touches `lib/settings.ts`'s schema, `lib/radarr.ts`/`lib/sonarr.ts`'s
      single-URL/key model, and the request UI's instance picker (doesn't
      exist yet).
- [ ] **Broader notification agent list** - verified from
      `server/lib/notifications/agents/` in their source. Weavarr has
      Discord, generic Webhook, Pushover (3). Seerr also has: Email,
      Gotify, ntfy, Pushbullet, Slack, Telegram, Webpush (10 total).
      Webpush is worth prioritizing over the others - real-time browser
      push notifications needing zero external account/service, just
      browser permission, which fits this project's whole
      avoid-external-dependencies direction better than Discord/Telegram/
      Slack do.
- [ ] **Emby support** - Seerr covers Jellyfin, Plex, and Emby. Weavarr
      only does Plex + Jellyfin.
- [ ] **In-app log viewer** - a Settings page (`SettingsLogs`) showing the
      app's own logs in the UI. Weavarr has nothing like this - the only
      way to see what's wrong right now is `docker logs`/`journalctl` over
      SSH, which most public self-host users won't have access to at all.
      Probably higher priority than it looks for the public-repo goal.
- [ ] **Jobs/cache management page** - view and manually trigger scheduled
      background jobs, clear caches, from the UI (`SettingsJobsCache`).
      Weavarr's background jobs (the `instrumentation.ts` pollers -
      import notifications, connection health, watched sync, scheduled
      backups) are invisible and unmanageable once running - no way to
      see last-run time, trigger one early, or know if one's silently
      failing.
- [ ] **Public REST API** - Seerr exposes a documented API
      (`/api-docs` locally) for third-party tools to request/query
      against. Scoped early in the 2026-08-08 session (`/api/v1/*` with
      an API key: movie/show request, library list, status, search) but
      never greenlit - deliberately deferred, not forgotten.

## Things Weavarr has that Seerr does not

Verified 2026-08-08 by reading Seerr's source directly (not assumed):

- **Calendar page** - scanned Seerr's full `src/components` listing (A-Z).
  There's `AirDateBadge` (a small inline "airs in N days" badge on
  individual media cards) but nothing resembling an actual month-grid
  calendar merging Sonarr + Radarr release dates. No equivalent exists.
- **In-app Backup/Restore** - checked Seerr's full `Settings` component
  list (`SettingsAbout`, `SettingsJobsCache`, `SettingsLogs`,
  `SettingsMain`, `SettingsNetwork`, `SettingsUsers`, `SettingsJellyfin`,
  `SettingsMetadata`, `SettingsNotifications`, `SettingsPlex`,
  `SettingsServices`) - no backup component. Seerr expects you to back up
  the Postgres/SQLite file yourself, outside the app.
- **"Not Found" give-up tracking** - traced this all the way through
  Seerr's actual request lifecycle to be sure, not just a guess. Their
  `MediaRequestStatus` enum (`server/constants/media.ts`) has a `FAILED`
  state, but tracing `server/routes/request.ts` shows it's paired with
  an admin-only `POST /:requestId/retry` endpoint that resets `FAILED`
  back to `APPROVED` and resends the request to Radarr/Sonarr - meaning
  `FAILED` represents the *initial API call to Radarr/Sonarr erroring*
  (network hiccup, bad config), not "searched for weeks and there's
  genuinely no release anywhere." Radarr/Sonarr's own `wanted/missing`
  list (what Weavarr's Not Found section is built on) represents items
  that *were* successfully added/monitored and just never turn up a
  release - Seerr has no status, route, or UI for that state at all.

## Not gaps - Weavarr already has an equivalent

- **Watchlisting & blocklisting** - Seerr's README lists this as a
  feature; Weavarr's favorites + "sucks" list already cover the same
  ground (want to watch / never recommend this).
- **PostgreSQL option** - Seerr supports Postgres or SQLite. Weavarr is
  SQLite-only, which is intentional (see [[backup_restore_feature]] /
  the SQLite-vs-.env.local discussion) - not worth chasing Postgres
  support unless a real scale need shows up, since SQLite was chosen
  specifically to avoid exactly the kind of external-service setup
  burden a Postgres option would reintroduce for most self-hosters.
