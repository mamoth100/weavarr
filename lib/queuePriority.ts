const PRIORITY: Record<string, number> = {
  downloading: 0,
  importing: 1,
  importPending: 1,
};

/** Bubbles actively-downloading and about-to-import items to the top, ahead of stuck/blocked ones sitting idle further down. */
export function trackedStatePriority(state: string): number {
  return PRIORITY[state] ?? 2;
}
