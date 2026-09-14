'use client';

import { useState } from 'react';

export type RestartStatus = 'idle' | 'restarting' | 'back' | 'error';

/**
 * The Restart App button: ask the server to exit, then poll until it answers
 * again. Shared by the Settings tabs and the Backup tab, which used to carry
 * the same loop each.
 */
export function useRestartApp(onBack?: () => void) {
  const [restartStatus, setRestartStatus] = useState<RestartStatus>('idle');
  const [restartError, setRestartError] = useState<string | null>(null);

  async function restart() {
    setRestartStatus('restarting');
    setRestartError(null);
    try {
      const res = await fetch('/api/settings/restart', { method: 'POST' });
      if (res.status === 400) {
        // Outside Docker nothing would bring the process back, so the server refuses.
        const data = await res.json().catch(() => ({}));
        setRestartError(typeof data.error === 'string' ? data.error : 'Restart refused');
        setRestartStatus('error');
        return;
      }
    } catch {
      // Expected: the request can fail right as the process dies mid-response.
    }
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const res = await fetch('/api/settings', { cache: 'no-store' });
        if (res.ok) {
          setRestartStatus('back');
          onBack?.();
          return;
        }
      } catch {
        // still down, keep polling
      }
    }
    setRestartError('Did not come back within 30 seconds. Check the container logs.');
    setRestartStatus('error');
  }

  /** Back to idle, so a fresh save no longer shows the outcome of an earlier restart. */
  function reset() {
    setRestartStatus('idle');
    setRestartError(null);
  }

  return { restartStatus, restartError, restart, reset };
}
