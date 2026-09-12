#!/bin/sh
set -e

# Bind-mounted folders that Docker creates on the host (a fresh install has no
# ./config or ./data yet) come up owned by root, but the app runs as the
# unprivileged "weavarr" user and has to write its settings file and database
# into them. Hand them over, then drop privileges. Config is tiny so it gets a
# recursive chown (covers a pre-existing .env.local); data only the folder
# itself, since a poster cache can hold thousands of files.
chown -R weavarr:nodejs /app/config 2>/dev/null || true
chown weavarr:nodejs /app/data 2>/dev/null || true

exec su-exec weavarr:nodejs "$@"
