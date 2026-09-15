'use client';

import { useEffect, useRef, useState } from 'react';
import { buttonClass, armedButtonClass } from '@/components/buttonClass';

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

  // Danger reads as danger before it is armed: outlined red rather than the
  // same grey pill as every harmless action beside it.
  const idle = buttonClass({ tone: intent === 'danger' ? 'danger' : 'primary', compact });
  const armed = armedButtonClass(compact);

  return (
    <div>
      {status === 'idle' ? (
        <button onClick={arm} className={idle}>
          {label}
        </button>
      ) : status === 'armed' ? (
        <button onClick={run} className={armed}>
          {confirmLabel}
        </button>
      ) : status === 'busy' ? (
        <button disabled className={armed}>
          {busyLabel}
        </button>
      ) : (
        <button onClick={arm} className={armed}>
          Failed - retry
        </button>
      )}
      {/* Clamped: error messages are humanized at the source (lib/httpError),
          but no failure mode should ever be able to paint a wall of text. */}
      {status === 'error' && error && <p className="text-xs text-red-400 mt-1 max-w-xs break-words line-clamp-3">{error}</p>}
    </div>
  );
}
