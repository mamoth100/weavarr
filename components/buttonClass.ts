/**
 * One look for the small action buttons that sit on list rows (Watch,
 * Library, Backup). Every row button used to carry its own copy of the
 * padding, radius and colours, and they drifted: some were smaller, some
 * dimmer, some grey where the same action was red elsewhere.
 *
 * tone says what the action means, and that is the only thing that changes
 * the colour: neutral for harmless actions, danger for anything that
 * deletes (outlined red, so it reads as danger before it is armed).
 * The hover colour hints at the outcome (green for watched, amber for a
 * search). An error state is always solid red with "Failed - retry".
 */
export type ButtonTone = 'neutral' | 'success' | 'primary' | 'danger';

export function buttonClass(opts: { tone?: ButtonTone; compact?: boolean; error?: boolean } = {}): string {
  const { tone = 'neutral', compact = false, error = false } = opts;
  const size = compact ? 'px-2 py-0.5 rounded' : 'px-2.5 py-1 rounded-md';
  const base = `${size} text-xs font-medium whitespace-nowrap transition-colors disabled:opacity-60`;
  if (error) return `${base} bg-red-600 text-white hover:bg-red-500`;
  switch (tone) {
    case 'danger':
      return `${base} bg-transparent text-red-400 ring-1 ring-red-500/40 hover:bg-red-600 hover:text-white hover:ring-red-600`;
    case 'success':
      return `${base} bg-zinc-800 text-zinc-300 hover:bg-green-600 hover:text-white`;
    case 'primary':
      return `${base} bg-zinc-800 text-zinc-300 hover:bg-amber-500 hover:text-black`;
    default:
      return `${base} bg-zinc-800 text-zinc-300 hover:bg-zinc-700`;
  }
}

/** The solid red confirm/busy look ConfirmButton uses once armed. */
export function armedButtonClass(compact = false): string {
  const size = compact ? 'px-2 py-0.5 rounded' : 'px-2.5 py-1 rounded-md';
  return `${size} text-xs font-medium whitespace-nowrap bg-red-600 text-white hover:bg-red-500 disabled:opacity-60`;
}
