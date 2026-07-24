export async function register() {
  // Local dev keeps its own untracked data/notified-imports.json (gitignored,
  // never synced with the Pi's) — starting `npm run dev` locally would treat
  // everything the Pi already notified about as new and re-send real
  // Pushover pings. Only the Pi's .env.local should set this to 'true'.
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.ENABLE_IMPORT_NOTIFICATIONS === 'true') {
    const { checkForNewPlexImports } = await import('./lib/notifyOnPlexImport');

    checkForNewPlexImports().catch(() => {});

    const POLL_INTERVAL_MS = 2 * 60 * 1000;
    setInterval(() => {
      checkForNewPlexImports().catch(() => {});
    }, POLL_INTERVAL_MS);
  }
}
