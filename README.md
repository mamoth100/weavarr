# Weavarr

Self-hosted request and cleanup companion for Sonarr, Radarr, Plex and
Jellyfin. Browse and request from TMDB, see what is downloaded but unwatched,
and clear out what has been watched. One user, no accounts, runs anywhere
Docker runs.

## Before you start

You need Docker. That is the only thing to install first. If you already
run Sonarr or Radarr in Docker, you have it; skip to Install.

Linux or Raspberry Pi, in a terminal:

```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
```

Then log out and back in to apply the sudo settings.

Windows, in PowerShell:

```powershell
winget install Docker.DockerDesktop
```

Then open Docker Desktop from the Start menu once and let it finish setting
up. It turns on WSL 2 if needed and may ask you to sign out and back in.

Mac, in Terminal:

```bash
brew install --cask docker-desktop
```

Then open Docker Desktop from Applications once. If you do not use Homebrew,
download Docker Desktop from docker.com instead.

To check it worked, run `docker compose version`. It should print v2.24 or
higher.

## Install

One command does everything, including installing Docker if it is missing.
The script is short and plain; read it first if you like.

Linux or Raspberry Pi:

```bash
curl -fsSL https://raw.githubusercontent.com/mamoth100/weavarr/main/install.sh | bash
```

Windows, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/mamoth100/weavarr/main/install.ps1 | iex
```

If Docker Desktop was not installed, the Windows script installs it and
stops; open Docker Desktop once to let it finish, then run the same command
again. The script installs into a `weavarr` folder in your home directory.

### By hand

Linux, Raspberry Pi or Mac:

```bash
mkdir weavarr && cd weavarr
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/mamoth100/weavarr/main/docker-compose.pull.yml
docker compose up -d
```

Windows, in PowerShell:

```powershell
mkdir weavarr; cd weavarr
Invoke-WebRequest https://raw.githubusercontent.com/mamoth100/weavarr/main/docker-compose.pull.yml -OutFile docker-compose.yml
docker compose up -d
```

Open `http://<this machine>:6767` and fill in Settings. The Get started card
walks through what to connect: Radarr or Sonarr for requests, and Plex or
Jellyfin if you want the watched and cleanup features. Save, then click
Restart App.

## Service addresses

When Settings asks for the address of Sonarr, Radarr, Plex or your
downloader, use the IP address of the machine it runs on, even when that is
the same machine as Weavarr. For example `http://192.168.1.20:8989` for
Sonarr. Only the port changes per service: Radarr 7878, Sonarr 8989, Plex
32400, Jellyfin 8096, SABnzbd 8080, NZBGet 6789.

Do not use `localhost`. Inside Docker, localhost means Weavarr's own
container, so the connection test fails. The one exception is Linux with
`network_mode: host` turned on in the compose file, where localhost works
as normal.

## Update

Run the same install command again. It sees the existing install, pulls the
new image, restarts Weavarr and removes the old image.

Linux or Raspberry Pi:

```bash
curl -fsSL https://raw.githubusercontent.com/mamoth100/weavarr/main/install.sh | bash
```

Windows, in PowerShell:

```powershell
irm https://raw.githubusercontent.com/mamoth100/weavarr/main/install.ps1 | iex
```

### By hand

Linux, Raspberry Pi or Mac:

```bash
cd weavarr && docker compose pull && docker compose up -d && docker image prune -f
```

Windows, in PowerShell:

```powershell
cd weavarr; docker compose pull; docker compose up -d; docker image prune -f
```

The last step removes the image you just replaced. Docker keeps every old
image until something deletes it, and each one is about 300 MB, so twenty
updates without the prune would leave 6 GB of dead weight behind. The
prune only removes images nothing is using, so your other containers are
not affected.

Settings live in `./config/.env.local`. The database and caches live in a
Docker volume. Neither is touched by an update.
