'use client';

import { useEffect, useRef, useState } from 'react';

const ARM_TIMEOUT_MS = 5000;

/**
 * The one confirm pattern for every destructive action in the app: click the
 * button and it becomes a red confirm button in place ("Really delete?") -
 * click again to execute, wait 5s (or look away) and it quietly disarms.
 * Replaces the assorted hand-rolled "Delete? Yes / No" flows that every
 * panel had grown its own variant of.
 */
interface ConfirmButtonProps {
  label: string;
  confirmLabel: string;
  busyLabel: string;
  /** Throw on failure - the button shows "Failed - retry" plus the message. */
  action: () => Promise<void>;
  onSuccess?: () => void;
  /** Tighter padding for the small buttons inside season/episode rows. */
  compact?: boolean;
  /** danger (default) = red hover in idle; neutral = amber hover (Restore). Armed/busy is always red - that part is the warning. */
  intent?: 'danger' | 'neutral';
}

export default function ConfirmButton({
  label,
  confirmLabel,
  busyLabel,
  action,
  onSuccess,
  compact = false,
  intent = 'danger',
}: ConfirmButtonProps) {
  const [status, setStatus] = useState<'idle' | 'armed' | 'busy' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const disarmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (disarmTimer.current) clearTimeout(disarmTimer.current);
    },
    []
  );

  function arm() {
    setStatus('armed');
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    disarmTimer.current = setTimeout(() => setStatus((s) => (s === 'armed' ? 'idle' : s)), ARM_TIMEOUT_MS);
  }

  async function run() {
    if (disarmTimer.current) clearTimeout(disarmTimer.current);
    setStatus('busy');
    setError(null);
    try {
      await action();
      setStatus('idle');
      onSuccess?.();
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const size = compact ? 'px-2 py-0.5 rounded' : 'px-2.5 py-1 rounded-md';
  // Danger reads as danger before it is armed: outlined red rather than the
  // same grey pill as every harmless action beside it.
  const idleBase = intent === 'danger' ? 'bg-transparent text-red-400 ring-1 ring-red-500/40' : 'bg-zinc-800 text-zinc-300';
  const idleHover = intent === 'danger' ? 'hover:bg-red-600 hover:text-white hover:ring-red-600' : 'hover:bg-amber-500 hover:text-black';

  return (
    <div>
      {status === 'idle' ? (
        <button onClick={arm} className={`${size} text-xs font-medium transition-colors ${idleBase} ${idleHover}`}>
          {label}
        </button>
      ) : status === 'armed' ? (
        <button onClick={run} className={`${size} text-xs font-medium bg-red-600 text-white hover:bg-red-500`}>
          {confirmLabel}
        </button>
      ) : status === 'busy' ? (
        <button disabled className={`${size} text-xs font-medium bg-red-600 text-white opacity-60`}>
          {busyLabel}
        </button>
      ) : (
        <button onClick={arm} className={`${size} text-xs font-medium bg-red-600 text-white hover:bg-red-500`}>
          Failed - retry
        </button>
      )}
      {/* Clamped: error messages are humanized at the source (lib/httpError),
          but no failure mode should ever be able to paint a wall of text. */}
      {status === 'error' && error && <p className="text-xs text-red-400 mt-1 max-w-xs break-words line-clamp-3">{error}</p>}
    </div>
  );
}
