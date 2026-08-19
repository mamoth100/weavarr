# Feature roadmap (vs. Seerr, minus approval/users)

Weavarr deliberately skips Seerr's approval workflow and multi-user system
(explicit choice, not a gap). This tracks the real feature differences worth
closing, prioritized for a single-user setup focused on media management and
day-to-day friendliness.

Provenance: first pass 2026-08-08 verified by reading
https://github.com/seerr-team/seerr's source (not memory); expanded and
re-verified against the live source tree 2026-08-15 - every named component
below was confirmed to exist in `src/` or `server/` that day. "Overseerr" and
"Jellyseerr" merged into "Seerr" - search for Seerr when researching.

## Tier 1 - Daily-use wins (do these first)

- [x] **Availability badges on browse cards** (shipped 2026-08-15) - Seerr's `StatusBadge` /
      `StatusBadgeMini` shows at a glance, while browsing, whether a title is
      already in the library, partially available (some seasons), processing,
      or requested. Weavarr hides *watched* items but gives no "you already
      have this" signal until the detail page. Single biggest daily
      friendliness gap; moderate effort (Radarr/Sonarr membership data
      already flows through the app).
- [x] **Plex Watchlist sync** (shipped 2026-08-15, opt-in toggle) (`PlexWatchlistSlider`, watchlist pages) -
      anything added to the Plex watchlist from ANY Plex app auto-requests.
      Solo value: queue things from the couch in the Plex mobile app without
      opening Weavarr.
- [x] **In-app log viewer** (shipped 2026-08-15) (`SettingsLogs`) - read the app's own logs in the
      UI instead of `docker logs` over SSH. Also matters heavily for the
      public-release goal: strangers can't SSH into their own box knowledge-
      free.

## Tier 2 - Discovery depth

- [ ] **Person pages** (`PersonDetails`) - click an actor/director anywhere
      -> full filmography, requestable from there. Weavarr renders
      Director/Actors as dead text on detail pages.
- [ ] **Collections** (`CollectionDetails` + `CollectionRequestModal`) - a
      collection page ("Star Wars Collection") with one-click request of the
      whole set. No collections concept in Weavarr at all.
- [ ] **Discover home rows** (`Trending`, discover sliders, studio/network
      browsing) - trending/popular/upcoming surfaces. Weavarr's genre-browse
      home is strong for its documentary roots but has no "what's hot" view.

## Tier 3 - Power media management

- [ ] **Root folder + tags per request** (`AdvancedRequester`) - pick the
      destination root folder and apply Radarr/Sonarr tags at request time.
      Weavarr's advanced picker covers quality profile only.
- ~~**Multiple Radarr/Sonarr instances + separate 4K status**~~ - **SKIPPED
      2026-08-19**: the dual-library pattern exists for internet-facing
      multi-viewer servers (cheap-transcode 1080p + reserved 4K). Single
      user + LAN-only + the "download highest quality" option already
      covers the whole quality decision. Largest lift on the board for
      zero local value.

## Tier 4 - Notifications & background-job visibility

- [ ] **Webpush notifications** (`webpush.ts` agent) - native browser push,
      zero external accounts, best effort-to-value of the missing agents and
      the best fit for the avoid-external-dependencies philosophy.
- [ ] **Jobs & cache management page** (`SettingsJobsCache`) - every
      background job listed with last-run time and a manual trigger.
      Weavarr's pollers (import notifications, connection health, watched
      sync, scheduled backups) are invisible once running.
- [ ] **More notification agents** - Seerr also ships email, Telegram,
      Slack, Gotify, ntfy, Pushbullet (verified agent list 2026-08-15).
      Weavarr has Discord, generic Webhook, Pushover. Add by demand, after
      Webpush.

## Tier 5 - Public-release-only (skip while personal)

- [ ] **Emby support** - Seerr covers Plex/Jellyfin/Emby; Weavarr does
      Plex + Jellyfin.
- [ ] **Region/language-aware discovery + localization**
      (`RegionSelector`/`LanguageSelector`, translated UI) - matters for
      non-English users; the current English/all filter covers the owner.
- [ ] **Issue reporting** (`IssueModal`) - "bad audio on this file"
      tracking; mostly a multi-user workflow, marginal solo.
- ~~**Public REST API**~~ - **SKIPPED 2026-08-19**: Seerr needs one as a
      community project with third-party integrators; Weavarr IS the
      integration layer, audience of one. If an automation ever needs an
      endpoint, add that endpoint then.

## Parity already reached

- **Plex PIN sign-in** (2026-08-15) - same plex.tv PIN flow Seerr uses;
  no more hunting for the X-Plex-Token by hand. Verified end-to-end.

## Things Weavarr has that Seerr does not

Verified 2026-08-08 by reading Seerr's source directly (not assumed), and
still true on the 2026-08-15 re-check - Seerr acquires media and stops
caring; Weavarr owns the lifecycle after the download:

- **Calendar page** - month grid + mobile agenda merging Sonarr/Radarr
  release dates with watched/downloaded/missing status. Seerr has only a
  small `AirDateBadge` on cards.
- **In-app Backup/Restore** - scheduled zips of config+data, upload-to-
  restore. Seerr expects you to back up its database yourself.
- **"Not Found" give-up tracking** - surfacing items Radarr/Sonarr monitor
  but can never find, with Search Again / Delete. Seerr's `FAILED` state
  only covers the initial add-API call erroring, not "no release exists".
- **Cleanup lifecycle** - Recently Watched with per-episode/movie delete,
  disk-size visibility, watched-percent thresholds, excluded shows.
- **Watched sync** between Plex and Jellyfin.

## Not gaps - Weavarr already has an equivalent

- **Watchlisting & blocklisting** - favorites + "Not interested" cover the
  same ground.
- **PostgreSQL option** - Weavarr is SQLite-only on purpose (zero-setup
  self-hosting); not worth chasing unless a real scale need appears.
