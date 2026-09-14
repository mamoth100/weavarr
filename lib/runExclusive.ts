const inFlight = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` unless a run under the same name is still pending, in which case
 * the pending promise is returned instead of starting a second one. The
 * background pollers all use this: a slow media server used to let a
 * two-minute job outlast its own interval, and the overlapping run sent the
 * same "ready to watch" ping twice, or computed the same cleanup candidates
 * and notified twice.
 */
export function runExclusive<T>(name: string, fn: () => Promise<T>): Promise<T> {
  const existing = inFlight.get(name);
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => {
    inFlight.delete(name);
  });
  inFlight.set(name, p);
  return p;
}

/** True while a run under this name is pending. */
export function isRunning(name: string): boolean {
  return inFlight.has(name);
}
