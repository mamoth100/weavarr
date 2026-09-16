# Weavarr

Self-hosted request and cleanup companion for Sonarr, Radarr, Plex and
Jellyfin. Browse and request from TMDB, see what is downloaded but unwatched,
and clear out what has been watched. One user, no accounts, runs anywhere
Docker runs.

## Install

```bash
mkdir weavarr && cd weavarr
curl -fsSLo docker-compose.yml https://raw.githubusercontent.com/mamoth100/weavarr/main/docker-compose.pull.yml
docker compose up -d
```

Open `http://<this machine>:6767` and fill in Settings. The Get started card
walks through what to connect. Save, then click Restart App.

Needs Docker Compose v2.24 or newer.

## Service addresses

Inside the container, `localhost` is the container itself. For a service
running on the same machine, use `http://host.docker.internal:<port>`, for
example `http://host.docker.internal:8989` for Sonarr. Services on other
machines use their normal address.

On Linux you can instead uncomment `network_mode: host` in the compose file
(and remove the `ports` and `extra_hosts` sections) to keep using
`localhost` addresses. Docker Desktop on Windows and Mac ignores host
networking, so leave the default there.

## Update

```bash
cd weavarr && docker compose pull && docker compose up -d && docker image prune -f
```

The last step removes the image you just replaced. Docker keeps every old
image until something deletes it, and each one is about 300 MB, so twenty
updates without the prune would leave 6 GB of dead weight behind. The
prune only removes images nothing is using, so your other containers are
not affected.

Settings live in `./config/.env.local`. The database and caches live in a
Docker volume. Neither is touched by an update.

## Access

There is no login. Anyone who can reach port 6767 can use the app and,
through Settings and Backup, read the keys you configured. Keep it on your
LAN, or put an authenticating reverse proxy in front of it.
