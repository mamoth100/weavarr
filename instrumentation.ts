export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { checkForNewPlexImports } = await import('./lib/notifyOnPlexImport');

    checkForNewPlexImports().catch(() => {});

    const POLL_INTERVAL_MS = 2 * 60 * 1000;
    setInterval(() => {
      checkForNewPlexImports().catch(() => {});
    }, POLL_INTERVAL_MS);
  }
}
