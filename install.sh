#!/usr/bin/env bash
# Weavarr installer for Linux and Raspberry Pi.
#
#   curl -fsSL https://raw.githubusercontent.com/mamoth100/weavarr/main/install.sh | bash
#
# Installs Docker if it is missing (using Docker's own install script), then
# downloads the compose file into ~/weavarr and starts Weavarr. Safe to run
# again: a second run updates Weavarr instead of reinstalling anything.
# Optional: WEAVARR_DIR=/somewhere/else to change the install folder.
set -euo pipefail

DIR="${WEAVARR_DIR:-$HOME/weavarr}"
COMPOSE_URL="https://raw.githubusercontent.com/mamoth100/weavarr/main/docker-compose.pull.yml"

say() { printf '\n==> %s\n' "$*"; }

# Docker's own script needs root. Use sudo when we are not root already.
if [ "$(id -u)" -eq 0 ]; then SUDO=""; else SUDO="sudo"; fi

if ! command -v docker >/dev/null 2>&1; then
  say "Docker is not installed. Installing it with Docker's official script (this takes a few minutes on a Pi)."
  curl -fsSL https://get.docker.com | $SUDO sh
  if [ -n "$SUDO" ]; then
    $SUDO usermod -aG docker "$USER"
    say "Added $USER to the docker group. That applies after you log out and back in; this script uses sudo until then."
  fi
else
  say "Docker is already installed."
fi

# Compose v2 ships with Docker's script, but an older Docker may lack it.
if ! docker compose version >/dev/null 2>&1 && ! $SUDO docker compose version >/dev/null 2>&1; then
  echo "Docker is installed but 'docker compose' is missing. Install the docker-compose-plugin package for your distribution, then run this script again." >&2
  exit 1
fi

# Run docker as this user if the group is active, otherwise through sudo.
DOCKER="docker"
if ! docker info >/dev/null 2>&1; then
  DOCKER="$SUDO docker"
fi

say "Setting up $DIR"
mkdir -p "$DIR"
cd "$DIR"
if [ -f docker-compose.yml ]; then
  say "Existing install found, updating."
else
  say "Downloading the compose file."
fi
curl -fsSLo docker-compose.yml "$COMPOSE_URL"

say "Starting Weavarr"
$DOCKER compose pull
$DOCKER compose up -d
$DOCKER image prune -f >/dev/null

IP="$(hostname -I 2>/dev/null | awk '{print $1}')"
say "Weavarr is running."
echo "Open http://${IP:-<this machine>}:6767 and fill in Settings."
echo "Files live in $DIR. To update later, run this script again."
