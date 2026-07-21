const PRIORITY: Record<string, number> = {
  importing: 0,
  importPending: 1,
  importBlocked: 2,
  importFailed: 2,
  failedPending: 2,
  failed: 2,
  downloading: 3,
};

/** Order: importing, importPending, stuck/error states, downloading last (it's just normal ongoing activity, least urgent to look at). */
export function trackedStatePriority(state: string): number {
  return PRIORITY[state] ?? 2;
}
