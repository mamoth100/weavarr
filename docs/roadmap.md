# Feature roadmap (vs. Overseerr, minus approval/users)

Weavarr deliberately skips Overseerr's approval workflow and multi-user
system (explicit choice, not a gap). This tracks the real feature
differences worth closing, identified 2026-08-08.

- [ ] **Plex Watchlist sync** - Overseerr can auto-request whatever a user
      adds to their own Plex Watchlist. Weavarr has its own favorites
      system but nothing that watches Plex's built-in watchlist and acts
      on it.
- [ ] **Multiple Radarr/Sonarr instances** - Overseerr lets you configure
      more than one of each (e.g. a separate 4K instance, or an
      anime-specific Sonarr) and pick per-request. Weavarr is
      single-instance only - one Radarr, one Sonarr, full stop. Real
      architectural gap, not a small one - touches `lib/settings.ts`'s
      schema, `lib/radarr.ts`/`lib/sonarr.ts`'s single-URL/key model, and
      the request UI's instance picker (doesn't exist yet).
- [ ] **Broader notification agent list** - Weavarr has Discord, generic
      Webhook, Pushover. Overseerr also supports Telegram, Slack, Email,
      Gotify, ntfy, LunaSea. Weavarr's three cover the common cases but
      not the full spread.
- [ ] **Public REST API** - Overseerr exposes a documented API for
      third-party tools to request/query against. Scoped early in the
      2026-08-08 session (`/api/v1/*` with an API key: movie/show
      request, library list, status, search) but never greenlit -
      deliberately deferred, not forgotten.
