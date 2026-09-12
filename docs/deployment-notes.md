# Deployment notes (working log toward public install instructions)

This file tracks exactly what's done to get Weavarr running via Docker, so it
can be turned into real end-user install instructions later. Every command
run against the Pi during this work gets logged here as it happens.

## Target platforms

- **Linux / Raspberry Pi (Docker)** — primary path. Matches how the rest of
  a typical self-hosted media stack (Sonarr, Radarr, SABnzbd, NZBGet) is
  already run.
- **Windows (native installer)** — separate track, not started yet. Plan:
  bundle a portable Node runtime + Weavarr as a proper Windows Service
  installer (Inno Setup or similar), not Docker Desktop, to avoid requiring
  WSL2 as a prerequisite for non-technical users.

## Reference machine

- Host: `media01` (Raspberry Pi, Debian 13 "trixie", `aarch64`)
- Docker already installed and in use for: `sonarr`, `radarr`, `sabnzbd`,
  `nzbget` (all `lscr.io/linuxserver/*` images)
- Weavarr **cut over to Docker on 2026-08-08.** The native systemd path
  (`weavarr.service`, `npm run build` on the host) is stopped + disabled
  (`sudo systemctl stop weavarr && sudo systemctl disable weavarr`) but not
  deleted - fully reversible if ever needed. Docker Compose
  (`docker compose up -d`) is now the live production path.
- Host Node upgraded 20.20.2 → 22.23.2 (same NodeSource apt mechanism,
  new major-version repo: `curl -fsSL https://deb.nodesource.com/setup_22.x
  | sudo -E bash -` then `apt-get install -y nodejs`). Required because the
  app moved off Supabase onto `node:sqlite`, which needs Node 22.5+.
  Verified zero effect on sonarr/radarr/sabnzbd/nzbget - they're Docker
  containers with their own bundled runtimes, entirely isolated from the
  host's Node.
- **Trap: `/home/mamoth/DocuView/data/` on the host is stale, not live.**
  `docker-compose.yml` uses a Docker-managed named volume (`weavarr_data`)
  for `/app/data`, not a bind mount to the host checkout's `data/` folder.
  The host copy was a one-time snapshot made during the systemd→Docker
  migration and nothing has read or written it since - editing or deleting
  files there does nothing to what the running app actually sees. Caught
  this live (2026-08-08): deleted an orphaned `shield-pairing.json` from
  the host copy, confirmed via `docker exec weavarr ls /app/data` that the
  real file was untouched, had to redo the delete with
  `docker exec weavarr rm /app/data/shield-pairing.json` instead. To
  inspect or modify the app's actual live data, always go through
  `docker exec weavarr ...` or the app's own API - never the host path.

## For a brand-new Linux/Pi machine that doesn't have Docker yet

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # so docker commands don't need sudo each time
# log out and back in for the group change to take effect
```

## End-user install experience (decided, not yet built)

One-liner install script, same pattern as Docker's own installer / Portainer
/ Uptime Kuma / Tailscale:

```bash
curl -fsSL https://raw.githubusercontent.com/mamoth100/weavarr/main/install.sh | sh
```

`install.sh` will:
1. Check for Docker; install it via `get.docker.com` if missing.
2. Pull the published Weavarr image (Docker Hub or GHCR - not published yet).
3. Create a persistent host-mounted data folder (SQLite DB, poster cache
   survive container updates/restarts).
4. Drop a template `.env` for Radarr/Sonarr URLs + API keys (or prompt
   interactively - TBD).
5. Start the container with `--restart unless-stopped`.
6. Print the URL it's now reachable at.

Depends on a working, published image existing first - this is the last
step, not the first.

## Real bugs found and fixed getting this working

1. **Supabase broke the build outright.** `NEXT_PUBLIC_SUPABASE_*` gets
   baked in at build time, and secrets aren't available during a Docker
   build by design - `npm run build` failed with `supabaseUrl is
   required`. Root-caused why Supabase never made sense for a
   self-hosted, publicly-distributed app and replaced it with local
   SQLite (`node:sqlite`) instead of working around it.
2. **`localhost` doesn't mean the host from inside a container.** `.env.local`
   points at Radarr/Sonarr/etc via `localhost` (same box, works fine
   for a native process). Default Docker bridge networking isolates a
   container onto its own loopback, so it can't reach anything at the
   host's localhost. Fixed with `network_mode: host` in
   docker-compose.yml, so nobody using the file has to know this.
3. **Next.js froze error responses as permanent static pages.** Next
   decides static-vs-dynamic per API route by executing it once at
   build time and watching for a `cache: 'no-store'` fetch. Several
   lib functions throw immediately when their service's env var is
   missing, before ever reaching that fetch - so building without
   secrets (the Docker norm) let Next bake in "not configured" forever,
   regardless of the real env vars at runtime. Fixed by adding
   `export const dynamic = 'force-dynamic'` to all 36 API routes that
   lacked it.
4. **Compose project name leaked the old folder name.** The checkout
   is still literally at `.../DocuView` on disk even though the
   product is Weavarr, and Compose defaults every resource name
   (volumes, network, labels) to the directory name - volume showed up
   as `docuview_weavarr-data`. Fixed with an explicit `name: weavarr`
   in docker-compose.yml.
5. Docker's default port picked to match the existing Radarr (7878) /
   Sonarr (8989) convention - each subtracts 1 from every digit of the
   previous, so Weavarr's is **6767**.

## Remaining work (the board)

Status as of 2026-08-08:

- [x] Dockerfile, docker-compose.yml, working end-to-end on the Pi (arm64)
- [x] SQLite replacing Supabase
- [x] `.env.example` template (fresh clones have no `.env.local` at all -
      required, `docker compose` refuses to start without the `env_file`
      target existing - confirmed live)
- [x] Bind-mount `.env.local` into the container (not just inject its
      values) - Settings page was silently broken without this: reading an
      empty file and showing everything as "not configured" despite the
      app working correctly via env vars, and any save from the UI would've
      been lost on the next rebuild. Found and fixed 2026-08-08.
- [x] **Settings file moved to a mounted folder (2026-09-12).** The
      single-file mount above failed on a fresh install: with no
      `.env.local` on the host, Docker created a *directory* by that name
      and every save then errored. Now `./config` is mounted at
      `/app/config` (`CONFIG_DIR` in the image, `lib/configDir.ts`), the
      `env_file` entry is `required: false`, and the app creates the file
      on first save. The image also gained a root entrypoint
      (`docker-entrypoint.sh`, `su-exec`) that chowns the mounted folders
      before dropping to the `weavarr` user, because Docker creates a
      missing bind-mount source as root-owned. `docker-compose.pull.yml`
      is the copy-and-run file for people using the published image.
      Existing installs: `mkdir config && mv .env.local config/` once.
- [ ] **Test on amd64** - image has only ever been built/run on the Pi's
      arm64. `node:22-alpine` + `node:sqlite` both officially support amd64
      but this hasn't actually been verified on real x86 hardware yet.
      User is setting up Hyper-V VMs for this.
- [ ] **Multi-arch build + publish** - `docker buildx` with a multi-node
      builder (Pi as the arm64 node, an x86 VM as the amd64 node) so each
      platform builds natively, combined into one pushed manifest. Depends
      on the amd64 VM existing first.
- [ ] **Pick and set up a registry** - Docker Hub or GHCR, to push the
      multi-arch image to. Nothing published anywhere yet.
- [ ] **`install.sh`** - one-liner installer for end users (designed on
      paper above, not built). Depends on a published image existing.
- [ ] **Cross-distro install testing** - once `install.sh` exists, confirm
      it behaves the same on Ubuntu/Fedora/Debian/etc, not just Debian
      (what the Pi runs). Separate concern from architecture - the image
      itself doesn't care about host distro, only the *install script's*
      shell commands might (package manager differences, etc.)
- [ ] Optional polish: `HEALTHCHECK` in the Dockerfile; reverse-proxy/HTTPS
      guidance for anyone wanting to expose this outside their LAN
- [x] Backup/restore feature - manual "Backup Now" + scheduled automatic
      backups (opt-in, with retention), download/restore/delete per
      backup, own "Backup" area in Settings. Snapshots `.env.local` +
      everything under `data/` except the regenerable poster cache.
      Verified end-to-end on the Pi with real production data (2026-08-08):
      created a real backup, confirmed all 6 expected files present via
      `unzip -l`, then separately verified restore actually reverts a
      modified setting (tested locally with a throwaway value, not
      against production data).
- [x] **Fixed a second Docker-cutover bug found in passing**: the
      "Restart App" button in Settings was hardcoded to
      `sudo systemctl restart weavarr`, dead code since neither `sudo`
      nor `systemctl` exist inside the container (confirmed live) and
      the systemd service is stopped anyway. Now exits cleanly and lets
      `restart: unless-stopped` bring the container back - verified via
      `RestartCount` incrementing and the app coming back healthy.

## Cutover steps actually run (2026-08-08)

```bash
# Copy live data into the (correctly-named) Docker volume before switching
docker run --rm -v docuview_weavarr-data:/src:ro -v weavarr_data:/dest \
  alpine sh -c "cp -a /src/. /dest/ && chown -R 1001:1001 /dest"

# Stop the old path (reversible - not deleted)
sudo systemctl stop weavarr
sudo systemctl disable weavarr

# Start the new one
docker compose up -d

# Verified: favorites/watched/sucks row counts matched exactly (27/24/31),
# /api/status showed real Radarr/Sonarr/downloader data, all four other
# containers (sonarr/radarr/sabnzbd/nzbget) confirmed untouched throughout
# (same uptimes before and after).
```

## Standard deploy procedure (updated 2026-08-19)

```bash
ssh -i ~/.ssh/media01 mamoth@10.0.0.254
cd /home/mamoth/DocuView
git pull --ff-only
GIT_SHA=$(git rev-parse --short HEAD) docker compose build
docker compose up -d
```

The GIT_SHA prefix matters: it stamps the image with the commit it was
built from, which drives the Version display and the update check on
Settings > Status. Building without it still works, but Status shows
"unknown" and the update check stays silent.
