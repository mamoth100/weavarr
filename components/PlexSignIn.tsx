'use client';

import { useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 2 * 60 * 1000;

/**
 * "Sign in with Plex" - the PIN flow Plex's own apps (and Seerr) use, here
 * because finding an X-Plex-Token by hand is genuinely obscure. Opens Plex's
 * own login page; the password is entered on plex.tv, never in this app. Once
 * approved, the server saves the token into PLEX_TOKEN and this reports done.
 */
export default function PlexSignIn({ onSaved }: { onSaved?: () => void }) {
  const [status, setStatus] = useState<'idle' | 'waiting' | 'saved' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  async function handleClick() {
    setStatus('waiting');
    setError(null);
    try {
      const res = await fetch('/api/plex/auth', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Could not start Plex sign-in');

      // Open synchronously-ish after the click so popup blockers allow it.
      window.open(data.authUrl, '_blank', 'noopener,width=600,height=750');

      const deadline = Date.now() + POLL_TIMEOUT_MS;
      pollTimer.current = setInterval(async () => {
        if (Date.now() > deadline) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          setStatus('error');
          setError('Timed out waiting for the Plex sign-in - try again.');
          return;
        }
        try {
          const poll = await fetch(`/api/plex/auth/${data.pinId}`, { cache: 'no-store' });
          const body = await poll.json();
          if (body.status === 'saved') {
            if (pollTimer.current) clearInterval(pollTimer.current);
            setStatus('saved');
            onSaved?.();
          }
          // 'pending' - keep polling
        } catch {
          // transient poll failure - keep polling until the deadline
        }
      }, POLL_INTERVAL_MS);
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // The button never disappears - after a success it relabels to "Sign in
  // again" so re-auth (revoked token, password change, new account) is always
  // one click, not a hidden page-reload trick.
  return (
    <span className="inline-flex items-center gap-2 flex-wrap">
      <button
        type="button"
        onClick={handleClick}
        disabled={status === 'waiting'}
        className="px-2.5 py-1 rounded-md text-xs font-medium bg-amber-500 text-black hover:bg-amber-400 disabled:opacity-60"
      >
        {status === 'waiting' ? 'Waiting for Plex…' : status === 'saved' ? 'Sign in again' : 'Sign in with Plex'}
      </button>
      {status === 'saved' && (
        <span className="text-xs font-medium text-green-400">Signed in - token saved. Restart to apply.</span>
      )}
      {status === 'error' && <span className="text-xs text-red-400">{error}</span>}
    </span>
  );
}
