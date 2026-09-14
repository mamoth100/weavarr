#!/bin/sh
set -e

# Not root (compose "user:", rootless Docker, or a hardened runtime): nothing
# to fix up, just run. su-exec would fail here, so it is not attempted.
if [ "$(id -u)" != "0" ]; then
  exec "$@"
fi

# Optional PUID/PGID, the convention Radarr and Sonarr users already know:
# run the app as that uid/gid so files it writes into ./config and ./data on
# a bind mount belong to the host user instead of uid 1001.
# alpine has no usermod/groupmod, so the passwd and group lines are edited
# directly. The user line carries both ids, so the group change updates it
# too; otherwise `id weavarr` reports a group that no longer exists.
if [ -n "$PGID" ]; then
  sed -i "s/^nodejs:x:[0-9]*:/nodejs:x:$PGID:/" /etc/group
  sed -i "s/^weavarr:x:\([0-9]*\):[0-9]*:/weavarr:x:\1:$PGID:/" /etc/passwd
fi
if [ -n "$PUID" ]; then
  sed -i "s/^weavarr:x:[0-9]*:/weavarr:x:$PUID:/" /etc/passwd
fi

# Bind-mounted folders that Docker creates on the host (a fresh install has no
# ./config or ./data yet) come up owned by root, but the app runs unprivileged
# and has to write its settings file and database into them. Config is tiny
# so it gets a recursive chown (covers a pre-existing .env.local); data only
# the folder itself, since a poster cache can hold thousands of files.
chown -R weavarr:nodejs /app/config 2>/dev/null || true
chown weavarr:nodejs /app/data 2>/dev/null || true

exec su-exec weavarr:nodejs "$@"
