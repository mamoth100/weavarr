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
- Weavarr currently runs as a native systemd service (`weavarr.service`),
  built via `npm run build` directly on the host, using system Node
  (20.20.2, NodeSource apt package) — this is what's being replaced.

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
curl -fsSL https://raw.githubusercontent.com/mamoth100/DocuView/main/install.sh | sh
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

## Steps taken (this section fills in as work happens)

_(nothing executed yet as of this note - Dockerfile/compose work starts next)_
