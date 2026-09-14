# Code review findings, 2026-09-14

Whole-codebase review of the app as it stands at commit c3ad8f7, done by
reading every source file in five areas (Sonarr and Radarr integration,
media servers and cleanup, security and API routes, the React UI, build
and data) and tracing each finding through its callers. The top items in
every area were re-verified by hand against the code before being listed.
Nothing here is changed yet. Checkboxes so it works as a punch list.

Threat model for the security items: there is no login by design, so
"exploitable" means anyone who can reach port 6767 on the LAN, plus a
web page the user happens to visit (the CSRF middleware exists for that).

## Do now

- [ ] **NZBGet password committed in plain text.** `scripts/migrate_sab_to_nzbget.py:15`
      and `scripts/test_nzbget_servers.py:10` both contain the live password,
      and the repo has been public since 2026-09-13. Rotate the password in
      NZBGet, update it in Weavarr Settings, delete all three scripts under
      `scripts/` (the Supabase migration is dead too: it ignores `CONFIG_DIR`
      and recreates a table the app drops on boot). Rewriting history is
      optional once the password is rotated. (Scripts deleted and history
      rewritten 2026-09-14; the old commit is still fetchable by direct SHA
      until GitHub garbage-collects it. Password rotation is the real fix.)
- [ ] **Backup restore is remote code execution.** `lib/backup.ts:88-95`
      extracts every zip entry other than `.env.local` anywhere under the app
      root. Anyone on the LAN can upload a zip containing `server.js`, restore
      it, hit restart, and the container comes back running their code. Fix:
      reject the whole zip unless every entry is `.env.local` or under
      `data/`, and write the restored `.env.local` through the same key
      whitelist the settings save uses.
- [ ] **Protected-show check and the delete use different ids.**
      `app/api/sonarr/delete/route.ts:15-16` (also `delete-episode`,
      `delete-season`) checks `Number(seriesId)` but passes the raw body value
      to the delete, which is interpolated unencoded into the Sonarr URL. A
      value like `12?deleteFiles=true&` fails the check as NaN (404, treated as
      "nothing to protect") and then deletes series 12 with files. Fix: parse
      once, reject anything that is not a positive integer, and move the
      `assertSeriesDeletable` call inside the delete helpers themselves.
- [ ] **The protection guard fails open on any error.** `lib/sonarr.ts:337`
      returns "not protected" on every non-OK response, not just 404. A 503
      from Sonarr during a DB lock lets a delete of Friends through. Fix:
      null only on 404, throw on anything else so the delete is blocked.

## High

- [ ] **Excluded-shows list is read from boot-time env.** `lib/cleanupCandidates.ts:58`
      reads `process.env`, while the auto-delete toggle and grace days are read
      live from disk. Add "Roseanne" to the list and turn auto-delete on in
      one save: the toggle applies within the hour, the protection only after
      a restart. Fix: read `CLEANUP_EXCLUDED_SHOWS` through `getRawEnvValue`
      like the other live keys.
- [ ] **Title matching strips the disambiguator from both sides.**
      `lib/titleMatch.ts:20` makes "The Office (US)" equal "The Office (UK)"
      and "Battlestar Galactica" equal "Battlestar Galactica (2003)", and every
      consumer takes the first hit. With both Offices in Sonarr, a US watch
      resolves to whichever sorts first and auto-delete removes the UK file.
      Fix: strip only when exactly one side has a disambiguator; treat more
      than one matching series as ambiguous and skip; prefer id matching
      (Sonarr tvdbId vs Plex Guid and Jellyfin ProviderIds, which the sync
      already fetches).
- [ ] **Re-downloaded episodes are instantly deletable.** Plex and Jellyfin
      keep watched state across delete and re-add, so a rewatch request
      shows up as "Watched" with a grace period that expired weeks ago
      (`lib/cleanupCandidates.ts:127-143`). Fix: carry the episode file's
      `dateAdded` and require the watched date to be later than the import.
- [ ] **Season renumbering reaches the delete.** `lib/cleanupCandidates.ts:178-194`
      maps media-server season and episode numbers straight onto Sonarr's,
      while `plex.ts` and `jellyfin.ts` already document that servers number
      seasons differently (Kitchen Nightmares: Sonarr S6 is Plex S7). Watching
      Plex S07E01 can delete Sonarr S07E01, never watched. Fix: only accept a
      candidate when the air dates agree.
- [ ] **Settings writer emits raw values that every reader parses as dotenv.**
      `lib/settings.ts:242,248` writes `KEY=value` unquoted; `@next/env` and
      Compose both truncate at `#`, expand `$WORD`, and split on newlines. A
      password with `#` silently breaks after restart while the test passed,
      and a value with `\n` bypasses the key whitelist and can set arbitrary
      environment. Fix: reject non-strings and newlines with a 400; write
      single-quoted values with `'` escaped; strip matching quotes on read.
- [ ] **`network_mode: host` does nothing on Docker Desktop.** Windows and
      Mac users of `docker-compose.pull.yml` get a container that starts
      cleanly and is unreachable. Fix: default to bridge with
      `ports: ["6767:6767"]` and `extra_hosts: host.docker.internal:host-gateway`,
      document `http://host.docker.internal:7878` style URLs, keep host mode
      as a commented Linux option.
- [ ] **Library, Requests and Watch lists stop at 50 rows.**
      `hooks/useInfiniteReveal.ts:28-56` attaches its observer once, before
      the sentinel exists (every caller returns a loading state first), and
      never retries. A 300-movie library shows 50 forever. Fix: attach from a
      callback ref, or re-run when data arrives, and check once on attach.
- [ ] **Restore runs while the process keeps stale state in memory.**
      Module-level caches (`notified`, `synced`, `dismissed`, health status)
      write themselves back over the restored files within minutes, and the
      SQLite file is overwritten under open handles. Fix: after a restore,
      respond and then exit the process exactly as the restart route does.
- [ ] **Last-episode modal carries state between shows.**
      `components/LastEpisodeModal.tsx:22-29`. Untick "grab future episodes"
      for show A, and the next show's prompt opens unticked and saves
      `monitorFuture: false` for B without the user choosing it. Fix: key the
      modal on the series id.

## Medium

- [ ] **Connection test sends saved secrets to any URL.**
      `app/api/settings/test/route.ts:16-23` fills blank secrets from disk and
      sends them to the caller-supplied URL, so a curl from the LAN with
      `RADARR_URL: http://attacker` receives the real Radarr key. Fix: only fall
      back to the saved secret when the URL is blank or unchanged.
- [ ] **DNS rebinding bypasses the CSRF check.** `middleware.ts:45-64`
      compares Origin to Host only; after a rebind both name the attacker's
      domain. Fix: a Host allowlist (IP literal, localhost, `.local`, the host
      of `APP_URL`, forwarded host when `TRUST_PROXY`), 421 otherwise.
- [ ] **`trakt-debug` route ships.** `app/api/trakt-debug/route.ts` leaks part
      of the client id and forwards an unvalidated path to Trakt. Delete it.
- [ ] **Trakt public client id is a build-time value.** `NEXT_PUBLIC_TRAKT_CLIENT_ID`
      is inlined at `next build`; the published image bakes in undefined, so
      the Settings field can never work and Trakt scores never render for
      image users. Fix: serve the id from a small runtime route or a server
      component prop and drop the public setting.
- [ ] **Hand-picked and unaired episodes can be silently dropped on add.**
      `lib/sonarr.ts:132-151` gives up after eight tries and still reports
      success and records the picks in the ledger. Fix: report `pendingPicks`
      or throw, and only record once applied.
- [ ] **Season searches in Get more swallow every error.**
      `lib/sonarr.ts:1090`. Sonarr going away mid-request returns `ok: true`.
      Remove the catch or collect and throw once.
- [ ] **No poller has an in-flight guard.** `instrumentation.ts` timers
      overlap when a run outlasts its interval; the import poll can send the
      same "ready to watch" ping twice, auto-cleanup can notify twice. Fix: a
      small `runExclusive(name, fn)` used by every job, including the manual
      sync route.
- [ ] **Unreconcilable sync items retry every five minutes forever.**
      `lib/watchedSync.ts:210-212, 267-279`. Shows on one server only produce
      an error line per poll, each with a full episode-list fetch, and flood
      the 500-line log buffer. Fix: a retry-after map, log the first failure.
- [ ] **Watched sync fetches a full episode list per episode.**
      `lib/watchedSync.ts:272`. A 2000-episode backlog is 2000 series fetches
      per direction. Fix: group by target show and mark once per show.
- [ ] **Title fallback in the sync runs on id misses, not only on missing ids.**
      `lib/watchedSync.ts:128-133`. An item genuinely absent from the other
      server matches a same-named different show. Also `plexShowsByTitle`
      collapses two Plex shows with one title. Fix: fallback only when the
      source has no provider ids; key show maps by ratingKey and item id.
- [ ] **Protection is exact match on Sonarr's mutable title.**
      `lib/sonarr.ts:331-340`. A metadata refresh renaming "Roseanne" to
      "Roseanne (1988)" silently unprotects it. Fix: store the series id or
      tvdbId with each excluded entry; keep the title as a secondary match.
- [ ] **Plain `writeFile` for six JSON state files.** A torn write on power
      loss or during the restart route's `process.exit` resets the file to
      empty; the webpush keys case orphans every device subscription for
      good. Fix: one shared atomic write (tmp plus rename, as watchedSync
      already does) and log parse failures instead of swallowing them.
- [ ] **Threshold state is read-modify-written by concurrent callers.**
      `lib/cleanupCandidates.ts:32-50, 110-124`. Two overlapping page loads
      drop each other's entries and reset grace clocks. Fix: module-level
      cache plus a serialized write chain.
- [ ] **Boot backup plus count-based retention wipes history.** Ten restarts
      in an afternoon delete every older daily backup
      (`instrumentation.ts:157-166`). Fix: skip the boot run when the newest
      backup is younger than the interval.
- [ ] **Entrypoint requires root and hard-codes uid 1001.** `docker-entrypoint.sh`.
      `user:` in compose or rootless Docker makes `su-exec` fail and the
      container never starts. Fix: if not root, exec directly; else honour
      `PUID`/`PGID` before chown.
- [ ] **No HEALTHCHECK.** `docker ps` shows Up for a crashed server. Add a
      `/api/health` route and a Dockerfile HEALTHCHECK using busybox wget.
- [ ] **Request modal keeps state between opens.** `components/RequestShowModal.tsx:89-99`.
      Reopen Get more after an update: the old season is still ticked and
      unlocked with stale owned counts. Fix: reset selection and null the
      Sonarr state in the `!open` branch.
- [ ] **Queue rows share a key per season pack.** `components/StatusPanel.tsx:268`
      keys on `downloadId`, which every episode of a pack shares. Key on
      download id plus episode.
- [ ] **Download progress polling multiplies.** `hooks/useDownloadProgress.ts:75-82`.
      Each `refreshDownloadProgressSoon` starts a second untracked chain.
      Fix: track the burst timer and guard with a generation counter.
- [ ] **Library-status cache is never invalidated.** `hooks/useLibraryStatus.ts:16-34`.
      After a request or delete, other pages show the old pill until a hard
      reload. Fix: export an invalidate function and call it from add and
      delete success paths.
- [ ] **Modal has no focus management.** `components/Modal.tsx`. Keyboard users
      tab through the page behind the overlay. Fix: focus in on open, trap
      Tab, restore on close.
- [ ] **Drag-to-reorder has no keyboard path.** `components/DraggableCheckList.tsx`.
      Add move up and move down buttons.
- [ ] **Stalled-shows check fetches every series with files on every mount.**
      `lib/stalledShows.ts:43`. Filter by watch history first and memoize.
- [ ] **Requests page checks import history one call per missing episode.**
      `app/api/requests/route.ts:58-67`. Use one history-by-series call per
      series, cached.
- [ ] **Ready-to-watch calls `hasTitle` once per downloaded movie.**
      `lib/readyToWatch.ts:55`. Fetch both libraries once and match by tmdbId.
- [ ] **Get more issues N+1 calls.** `lib/sonarr.ts:1068-1104` fetches the
      episode list up to three times plus once per season, with a monitor PUT
      and a search per season. Fetch once, build one id set, one PUT, one
      search.
- [ ] **One downloader failing hides silently when the other succeeds.**
      `lib/downloaders.ts:37-46`. Return per-client errors and show them.

## Low

- [ ] **Backup upload has no size cap** and is buffered in memory
      (`app/api/backup/upload/route.ts`). Reject over a fixed size before
      reading the body.
- [ ] **Backup zips copy the SQLite file while it is open** (`lib/backup.ts:44-53`).
      Use `VACUUM INTO` a temp file and add that.
- [ ] **Backup download hands out every key** to anyone on the port. By design
      under the no-login model; say so plainly in the README.
- [ ] **Negative retention count deletes every backup daily.**
      `instrumentation.ts:159` uses `Number(x) || 10`; reuse
      `backupRetentionCount()` and validate on save.
- [ ] **Restart route kills the process outright** outside Docker
      (`app/api/settings/restart/route.ts`). Refuse when `/.dockerenv` is
      absent.
- [ ] **`watched` and `sucks` POST bind raw JSON into SQL.** Missing fields
      throw a 500 instead of a 400; validate and coerce.
- [ ] **Push subscription endpoints are unvalidated and unbounded.** Require
      an `https:` URL and cap rows.
- [ ] **Plex PIN poll is a GET with a side effect.** Make the save a POST.
- [ ] **Queue janitor uses raw env URLs** without the trailing-slash strip and
      returns silently on non-OK (`lib/queueJanitor.ts:51-54`).
- [ ] **Profile and root-folder fetches never check `.ok`** (`lib/sonarr.ts:76-83`,
      `lib/radarr.ts:66-73`); a 401 reads as "no quality profile configured".
- [ ] **Validation errors from Sonarr and Radarr show raw JSON**
      (`lib/httpError.ts:14`); join the `errorMessage` values when the body is
      an array.
- [ ] **Season file delete is one call per episode** (`lib/sonarr.ts:773-777`)
      and double-deletes multi-episode files; use the bulk endpoint.
- [ ] **Routes accept untyped season and episode numbers** (`search-season`,
      `delete-episode`, `delete-season`, `radarr/add`, `calendar`); one
      `intParam` helper, 400 on failure.
- [ ] **Series-by-tmdb lookups pull the whole library**, and five routes fetch
      `getAllSonarrSeries` independently on the Library page. Query by tvdbId
      and memoize for ten seconds.
- [ ] **Plex library listing caps at 2000 items** with no paging
      (`lib/plex.ts:232`).
- [ ] **Movie relays omit `datePlayed`** (`lib/watchedSync.ts:220`), the same
      bug the episode path fixed.
- [ ] **Import notifications key on title plus date**, not `historyId`, and
      only look at the ten newest imports, so a season pack never notifies
      for most of it (`lib/notifyOnPlexImport.ts:55-67`).
- [ ] **Air-date fallback accepts any same-day episode** (`lib/plex.ts:76`,
      `lib/jellyfin.ts:103`), so a two-episode night reports E02 ready when
      only E01 scanned.
- [ ] **Compose files need Compose v2.24+** (`env_file` object form, `name:`)
      and fail on apt's 1.29. State the minimum in the header, or load the
      settings file in-process and drop `env_file`.
- [ ] **Workflow has no concurrency group**, so two quick pushes can leave
      `latest` on the older commit.
- [ ] **Three SQLite handles, no WAL, no busy timeout, no schema version**,
      and `DROP TABLE favorites` on every boot. One `lib/db.ts` with pragmas
      and numbered migrations.
- [ ] **Netlify leftovers** (`@netlify/plugin-nextjs`, `netlify.toml`) install
      on every image build; no root README for people landing from GHCR.
- [ ] **Trakt test only reads the public key**, so filling only the server
      key says "Client ID required" while the dot says configured.
- [ ] **Side effects inside `setState` updaters** in three components fire
      twice under StrictMode; compute, set, then act.
- [ ] **"+N more" button nested inside the row link** on Watch; move it out.
- [ ] **Detail page fetches series state three times** (chip, availability,
      modal); one hook with a module cache.

## Simplification (no behaviour change)

- `lib/sonarr.ts`: six functions fetch the same episode endpoint; one raw
  fetch the rest map over. `ImportHistoryItem` is declared twice. Enabled and
  URL logic is re-derived in `downloadProgress.ts` and `queueJanitor.ts`.
- `lib/plex.ts` and `lib/jellyfin.ts` each duplicate `stripDisambiguator`
  from `titleMatch.ts`; `readyToWatch.ts` re-exports `titlesMatch` under a
  second name.
- `lib/tmdb.ts` inlines the same TV-result normalizer four times.
- `lib/connectionTests.ts`: `testRadarr` and `testSonarr` are identical.
- `app/api/backup/[filename]/route.ts` re-declares the backup dir and
  filename check from `lib/backup.ts`.
- `components/ReadyToWatchPanel.tsx`: move the three sections (missing
  aired, missing movies, stalled) to their own files; one `useDismissable`
  hook replaces four copies of the outside-click plus Escape effect.
- `components/SettingsPanel.tsx`: move the chopping block, show-list editor
  and field renderer to their own files; collapse the three service action
  buttons into one; move the group tables to `lib/settingsGroups.ts`.
- A `postJson(url, body)` helper and a `useAsyncAction` hook would remove
  the status plus error plus fetch plus throw pattern from about twelve
  components. `BackupPanel` duplicates the restart poll verbatim.
- `CardGrid.tsx` still carries "snapshot" state that later effects keep
  live; derive the sets directly.

## Solid, keep it

- Every outbound call goes through `fetchWithTimeout`, honours the
  configured timeout, and its error names only the host, so keys in query
  strings never reach the logs.
- The CSRF middleware is carefully reasoned: blocks a null Origin, uses
  `Sec-Fetch-Site` as fallback, trusts forwarded headers only behind
  `TRUST_PROXY`, logs every block with a reason.
- Deletes re-assert the protection server-side in every route and in the
  hourly job, treat 404 as success, and alert on real failures.
- The add lookup chain (tvdb, imdb, title) targets the exact series; the
  add and expand routes validate season and episode arrays properly.
- Settings writes are serialized and preceded by a timestamped backup;
  watched-sync state persists through tmp plus rename behind a promise
  chain. These are the patterns the other state files should copy.
- Multi-stage standalone Docker build is right: static assets copied,
  `sharp` present, secrets and data dockerignored, root dropped via
  su-exec, LF enforced on shell scripts, workflow builds each arch
  natively and can never publish `latest` from a half-failed build.
- The log ring buffer is bounded, lives on `globalThis`, and cannot break
  the thing it logs.
- `CalendarPanel` handles the month-fetch race with a generation counter;
  `InfiniteBrowse` documents and avoids the StrictMode updater trap;
  `ConfirmButton` and `Toggle` are small, correct, accessible primitives.
- `status`, `library-status`, `requests` and `calendar` degrade per backend
  instead of blanking the page when one service is down.

## Suggested order

1. Rotate the NZBGet password and delete the scripts.
2. Restore zip whitelist, delete-route id parsing, guard fail-closed.
3. Excluded-shows live read, title-match tightening, re-download and
   renumbering guards (everything that can delete the wrong file).
4. Settings writer quoting and newline rejection.
5. Compose bridge networking for Windows and Mac users, then the 50-row
   list bug, then restore-then-exit.
6. The medium list in order, then the lows as time allows.
