# Seerr gap board - the exhaustive one

Provenance: live audit 2026-08-18 of Seerr **3.4.1** running at 10.0.0.254:5055 -
complete settings.json dump (every field), authenticated API surfaces
(discover sliders, user/quota/permission structures, override rules, jobs),
plus the 2026-08-15 source-tree review. Companion to [roadmap.md](roadmap.md):
the roadmap holds the prioritized tiers; this board is the *complete* field-by-
field inventory, down to the allow-SSL tier, plus ideas neither app has.

Legend: `[ ]` open · `[x]` done · **GAP** = Seerr has it, we don't ·
**DIFF** = we cover it a different way · **SKIP** = deliberately not doing
(single-user stance) · (S/M/L) = effort · **RELEASE** = launch-blocking for
the public release (stated goal 2026-08-19).

---

## 0. Public release checklist

Decided 2026-08-19: Weavarr is going public. These are the launch-blockers,
in build order - everything else on the board is optional polish by
comparison. The no-users rule survives release: the stance is "no accounts
by design - gate access at your reverse proxy / VPN," stated in the README,
not an auth system.

1. [x] **RELEASE** (S) `trustProxy` - **SHIPPED 2026-08-19** as TRUST_PROXY
   setting (default off): trusted X-Forwarded-Host joins the CSRF allow-set,
   X-Forwarded-For becomes the logged client IP.
2. [x] **RELEASE** (S) CSRF protection - **SHIPPED 2026-08-19**: middleware
   on all state-changing /api calls, on by default, Origin-vs-host match
   (+ APP_URL + trusted forwarded host); non-browser clients pass through.
   Verified: forged-Origin 403, same-origin browser 200, no-Origin curl 200.
3. **REMOVED 2026-08-19** ~~Deployment-stance docs~~ - user call: not
   interested; revisit only if accounts ever become a question.
4. [ ] **RELEASE** (S) `versionCheck` - "update available" notice; strangers
   won't be pulling git like we do.
5. [x] **RELEASE** (S) Application title + URL - **SHIPPED 2026-08-19**:
   APP_TITLE drives the browser tab + link labels, APP_URL deep-links every
   notification (Pushover url, Discord clickable embed, webhook url field;
   imports land on /ready-to-watch, alerts on /status).
6. [x] **RELEASE** (S) `apiRequestTimeout` - **SHIPPED 2026-08-19**: every
   outbound service fetch (111 call sites, 18 libs) rides one wrapper with
   a deadline. Default 10s, API_REQUEST_TIMEOUT setting in App Config.
   Verified against a blackholed Sonarr: 3.1s fail at 3s config, 10.1s at
   default, readable "No response from host within Ns" errors.

Second wave (post-launch, demand-driven): proxy support, forceIpv4First/DNS
knobs, cacheImages, then the public API when integrators appear (§8).

## 1. Network & server config

- [x] **RELEASE #5** Application title + URL - shipped 2026-08-19 (see §0).
- [ ] **GAP** (M) HTTP(S) proxy support (`network.proxy`: host/port/ssl/auth/bypass list/bypass-local) - all outbound TMDB/Plex traffic through a proxy. Matters for some self-hosters. Release second wave.
- [x] **RELEASE #1** `trustProxy` - shipped 2026-08-19 (see §0).
- [x] **RELEASE #2** `csrfProtection` - shipped 2026-08-19 (see §0).
- [ ] **GAP** (S) `forceIpv4First` + DNS cache controls (`dnsCache.forceMinTtl/forceMaxTtl`) - escape hatches for broken IPv6/DNS setups. Release second wave.
- [x] **RELEASE #6** `apiRequestTimeout` - shipped 2026-08-19 (see §0).
- [ ] **GAP** (M) `cacheImages` - proxy + cache TMDB images locally (bandwidth/privacy). We cache Radarr/Sonarr posters but hotlink TMDB. Release second wave.
- [ ] **GAP** (S) **RELEASE #4** `versionCheck` - "an update is available" notice. We have no update awareness at all.
- **DIFF** Per-connection `useSsl`/hostname/port/urlBase (radarr/sonarr/plex/jellyfin) - Seerr splits these into fields; we take full URLs, which already carry scheme/port/path. Covered, arguably better. Nothing to do.
- **SKIP** `locale` + full UI i18n - roadmap Tier 5 already parks localization.

Not on this board by design: user management, permissions, quotas, approval
queues, request-as-user, per-user anything. Weavarr is single-user on
purpose - that entire Seerr subsystem is out of scope, permanently.

## 2. Service connections (Radarr/Sonarr)

- **SKIP** ~~(L) Multiple instances + `is4k` per instance + `isDefault` routing~~ - **2026-08-19**: solves the two-library problem of internet-facing multi-viewer servers (cheap-transcode 1080p + reserved 4K). Single user + LAN-only + the "download highest quality" option covers the entire quality decision already. Largest effort on the board for zero local value.
- [ ] **GAP** (S) `minimumAvailability` for Radarr adds (announced/inCinemas/released) - we always add with Radarr's default.
- [ ] **GAP** (M) Root folder picker at request time (`activeDirectory` + per-request override) - roadmap Tier 3; we use Radarr/Sonarr's first root folder, no choice.
- [ ] **GAP** (M) Tags: default tags per service, `animeTags` - we send no tags ever.
- [ ] **GAP** (S) `enableSeasonFolders` toggle on Sonarr adds - we inherit whatever the lookup returns.
- [x] `monitorNewItems` on Sonarr adds - shipped with the request modal (future-seasons toggle).
- [ ] **GAP** (M) Override rules (`/api/v1/overrideRule`) - condition-based routing: "if genre anime -> this profile/folder/tags". Powerful, niche.
- [ ] **GAP** (S) `preventSearch` on add - add without triggering the search. We always search.
- **DIFF** `syncEnabled` (Seerr scans arr libraries into its own DB) - we query live instead of syncing. No DB drift, slightly slower pages. Deliberate.
- [ ] **GAP** (S) `metadataSettings` (tv/anime metadata source) - anime handling generally; we treat everything as TMDB-shaped.

## 3. Media status & sync

- [x] Download progress on cards AND detail pages (shipped 2026-08-18) - live percent chip + bar, adaptive 12s/60s polling, plus a Request pill on cards (armed two-click for movies, modal for shows) so the card walks Request -> Requested -> downloading % -> In your library. Goes beyond Seerr's static "Processing" badge.
- [ ] **GAP** (S) Per-season availability display on the show detail page (Seerr colors each season) - we show counts, not per-season state colors.
- **DIFF** Library scanning (`plex-recently-added-scan` 5min, `plex-full-scan` 3am, per-library enable) - Seerr maintains its own media DB (75 items on this instance); we ask Plex/Jellyfin/arr live. Deliberate, keeps zero drift.
- [x] Watchlist sync (both have it; theirs every 3min, ours 10 - fine).
- [ ] **GAP** (S) `hideAvailable` toggle - hide already-available titles from discovery (we hide *watched*; "hide owned" is a different, useful filter).
- [ ] **GAP** (S) `enableSpecialEpisodes` - allow requesting season 0/specials. Our modal filters specials out unconditionally.
- [x] Partial/season requests (`partialRequestsEnabled`) - shipped with the request modal, ours does arbitrary combinations.

## 4. Requests workflow

- [x] Requests ledger (shipped 2026-08-18) - permanent record of every request (clicks and watchlist auto-adds, source-tagged) in weavarr.db, with status derived LIVE at view time (downloading % / searching-day-N / available / removed) instead of Seerr's stored-status-plus-sync-jobs model. The "removed" tombstone answers the Chappelle question forever. /requests page + menu entry.
- [ ] **GAP** (M) Issues system (audio/video/subtitle/other + comments + notifications) - roadmap Tier 5 called it marginal solo; still a gap.
- [ ] **GAP** (S) Blocklist media (`hideBlocklisted`, `blocklistedTags`, auto-blocklist by tag job) - our "Not interested" covers the manual case; tag-based auto-blocklist ("talk-show", "reality") is a genuinely nice discovery filter.

## 5. Discovery

- [x] **GAP** (M) Discover home - **SHIPPED 2026-08-19** as stacked vertical sections, NOT sliders (explicit product call: no horizontal scrolling anywhere). Trending this week / Popular movies / Popular shows / Coming soon, 10-card slices with "See all" into full infinite-scroll views (?genre=trending / popular-movies / popular-tv). Lives in the genre catalog: drag Discover to the top of Menu settings = default landing. Skipped from Seerr's 12: studios/networks/genre sliders (genre tabs already cover genres).
- [ ] **GAP** (M) Custom discover sliders (user-defined TMDB keyword/genre/studio lists, reorderable, can be marked built from the sliders API) - the power version of our menu-genre customization.
- [ ] **GAP** (S) `discoverRegion` + `originalLanguage` + `streamingRegion` filters - region-aware discovery; we filter English/all only.
- [ ] **GAP** (M) Person pages (actor/director filmography) - roadmap Tier 2.
- [ ] **GAP** (M) Collections page + request-whole-collection - roadmap Tier 2.
- [x] "Where to watch" providers - audit error: this already existed (stream + rent logos, JustWatch attribution).
- [x] Trailers (2026-08-18) - existed as an external YouTube link; now embeds in-app in the shared Modal.
- [x] "More Like This" rows (shipped 2026-08-18) - TMDB recommendations as full cards (badges/request pills/progress all live there too).
- [x] Genre chips (shipped 2026-08-18) - detail.genres now render as chips linking into the browse grid via catalog mapping; keywords remain informational pills.
- [x] Hover synopsis on cards (ours; Seerr shows text under poster).
- [x] Availability badges on cards (parity).

## 6. Notifications

Ours: Discord, Pushover, generic webhook - flat "send everything" per channel.
Theirs: email (full SMTP incl. `secure`/`ignoreTls`/`requireTls`/`allowSelfSigned`/`senderName`), Telegram (thread id, silent send), Slack, Gotify (priority), ntfy (topic/priority), Pushbullet, Webpush (PWA push, VAPID), Discord (role mentions, locale), webhook with **templated JSON payload** (`{{notification_type}}`, `{{media}}` variables).

- [ ] **GAP** (M) Webpush - roadmap Tier 4 pick (no external account needed, best fit).
- [ ] **GAP** (S) Per-event-type granularity (`types` bitmask per agent) - ours is all-or-nothing per channel; "only tell me about failures" is a real want.
- [ ] **GAP** (S) Webhook JSON payload templating with variables - ours sends a fixed shape.
- [ ] **GAP** (S) `embedPoster` toggle (rich notifications with artwork).
- [ ] **GAP** (M) Email/SMTP agent (with the full TLS knob set).
- [ ] **GAP** (S each) Telegram, ntfy, Gotify, Slack, Pushbullet - add by demand after Webpush.

## 7. Jobs & maintenance

- [ ] **GAP** (M) Jobs page: every background job listed with next-run, **editable cron schedule**, run-now and cancel buttons - roadmap Tier 4. Ours run on fixed code intervals, invisible. (Our jobs today: import notifications 2m, connection health 10m, watchlist sync 10m, watched sync 5m, poster sweep 24h, backups 24h.)
- [x] Image cache cleanup - our poster sweep (2026-08-17) covers the equivalent.
- [x] Logs page - ours aggregates six services; theirs shows only its own. Weavarr advantage.
- [x] Backup/restore - Weavarr only. Advantage.
- [ ] **GAP** (S) About page basics we lack: total media items / total requests counters, timezone display. (Our Settings > Status has version/uptime/disks - add the counts.)

## 8. API & integrations

- [ ] **GAP** (L) Public documented REST API (`/api/v1` + Swagger, API key with regenerate) - **PARKED until post-release demand (2026-08-19)**: public release is the plan, but the API's audience (dashboard widgets, companion apps, scripts) only exists after adoption, and a published API is a compatibility promise you can't reshape freely. Build it when integrators show up and their requests define the shape. NOT a launch requirement - the launch checklist is the §1 hardening pile (trustProxy, CSRF, versionCheck, applicationUrl, timeouts) plus a documented "no-users by design, gate it at your reverse proxy" deployment stance.
- [ ] **GAP** (M) Tautulli integration (richer Plex watch stats); our watched-sync reads Plex/Jellyfin directly. Partially DIFF, listed because Tautulli unlocks deeper history.
- **DIFF** PWA installability - Seerr is a full PWA with manifest + webpush; we have responsive web only. Fold into the Webpush item.

---

## Features NEITHER app has (build-someday board)

Graded gut-check: value to a self-hosted household, not novelty.

- ~~**(S) Calendar ICS feed**~~ **SKIP 2026-08-19** - the app is LAN-only, so server-side calendar fetchers (Google Calendar) can't reach the feed and device-side ones only refresh at home. Verdict: a bookmark to the Calendar page covers the actual use case.
- [ ] **(M) Storage forecast** - we already read disk space (Status tab) and grab history; project "at this month's pace, /media is full ~Oct 3" with a Logs/Status warning at 30 days out. Seerr shows nothing; Radarr shows raw free space only.
- [ ] **(M) Cleanup advisor** - rank the watched-and-still-on-disk list by "safe to delete" (watched long ago, not favorited, big on disk, ratings you gave it) instead of chronological. We have all the inputs and the delete plumbing already; this is the brain on top of our existing cleanup lifecycle.
- [ ] **(M) Year in review ("Weavarr Wrapped")** - once a year, a page: hours watched, top genres, fastest-binged show, storage churned. All derivable from Plex/Jellyfin history we already read. Pure delight feature.
- [ ] **(S) Stalled-show resurfacing** - shows watched >60% then untouched for 90+ days get a "finish the story?" row on the Watch page. Inputs all exist.
- [ ] **(M) Ratings-drop guard** - when a monitored show's new season lands with sharply worse ratings than prior seasons, surface "S9 is rating 40% below the show's average - keep auto-grabbing?" with a one-tap unmonitor. TMDB per-season votes make this feasible.
- [ ] **(M) Inline download progress via live updates** - not just Seerr-parity "Processing" badges, but SSE-pushed percent/ETA on the exact card you just requested. Request -> watch it fill up without leaving the page.
- [ ] **(L, exploratory) "Leaving soon" awareness** - flag watchlisted/library-relevant titles about to leave streaming services so you grab before they vanish. Data source (JustWatch via TMDB provider deltas) is the hard part; park until feasible.

---

## Weavarr already ahead (keep, don't regress)

Cross-service log aggregation · backup/restore with scheduling · merged
status-aware calendar · cleanup lifecycle (recently watched, sizes, deletes)
· not-found give-up tracking · Plex<->Jellyfin watched sync (provider-id
matched) · composite ratings (TMDB+IMDb+RT+Metacritic+Trakt) · hover synopsis
· infinite scroll everywhere · arbitrary season combinations at request time.
